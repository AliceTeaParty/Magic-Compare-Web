import type { MutableRefObject, TransitionStartFunction } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import type { WorkspaceNotificationTone } from "./use-workspace-notifications";

type GroupItem = CaseWorkspaceData["groups"][number];

export interface NotificationApi {
  dismissNotification: (notificationId: string) => void;
  pushNotification: (
    message: string,
    tone: WorkspaceNotificationTone,
    options?: { key?: string; sticky?: boolean },
  ) => void;
  showWorkspaceSavingNotification: () => void;
  dismissWorkspaceSavingNotification: () => void;
}

export interface WorkspaceMutationContext {
  data: CaseWorkspaceData;
  notifications: NotificationApi;
  refresh: () => void;
  startTransition: TransitionStartFunction;
}

export interface WorkspaceGroupMutationContext
  extends WorkspaceMutationContext {
  groupsRef: MutableRefObject<GroupItem[]>;
  setGroups: (
    updater: GroupItem[] | ((current: GroupItem[]) => GroupItem[]),
  ) => void;
}

/**
 * Normalizes JSON POST handling so workspace actions surface API errors with the same message
 * shape regardless of which operation triggered them.
 */
export async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Request failed: ${url}`);
  }

  return response.json().catch(() => null);
}

/**
 * Optimistic mutations need one shared state writer so the live ref and React state never diverge,
 * otherwise later requests can roll back to a snapshot the UI is no longer showing.
 */
function replaceWorkspaceGroups(
  groupsRef: MutableRefObject<GroupItem[]>,
  setGroups: (
    updater: GroupItem[] | ((current: GroupItem[]) => GroupItem[]),
  ) => void,
  nextGroups: GroupItem[],
) {
  groupsRef.current = nextGroups;
  setGroups(() => nextGroups);
}

/**
 * Visibility toggles stay optimistic because the action is binary and easy to undo, which keeps
 * workspace editing responsive without hiding persistence failures.
 */
export function toggleWorkspaceGroupVisibility(
  targetGroup: GroupItem,
  {
    data,
    groupsRef,
    notifications,
    refresh,
    setGroups,
    startTransition,
  }: WorkspaceGroupMutationContext,
) {
  const previousGroups = groupsRef.current;
  const liveTargetGroup = previousGroups.find(
    (group) => group.id === targetGroup.id,
  );

  if (!liveTargetGroup) {
    return;
  }

  const nextVisibility = !liveTargetGroup.isPublic;
  const nextGroups = previousGroups.map((group) =>
    group.id === targetGroup.id
      ? { ...group, isPublic: nextVisibility }
      : group,
  );

  replaceWorkspaceGroups(groupsRef, setGroups, nextGroups);
  notifications.showWorkspaceSavingNotification();

  startTransition(() => {
    void postJson("/api/ops/group-visibility", {
      caseSlug: data.slug,
      groupSlug: targetGroup.slug,
      isPublic: nextVisibility,
    })
      .then(() => {
        notifications.pushNotification(
          nextVisibility
            ? `Marked ${targetGroup.title} as public. Publish the case to refresh the public bundle.`
            : `Marked ${targetGroup.title} as internal. Publish the case to remove it from the next public bundle.`,
          "success",
        );
        refresh();
      })
      .catch((error) => {
        replaceWorkspaceGroups(groupsRef, setGroups, previousGroups);
        notifications.pushNotification(
          error instanceof Error
            ? error.message
            : "Failed to update group visibility.",
          "error",
        );
      })
      .finally(() => {
        notifications.dismissWorkspaceSavingNotification();
      });
  });
}

/**
 * Publishing stays explicit instead of piggybacking on every edit so operators can batch multiple
 * workspace changes before spending time rebuilding the public bundle.
 */
export function publishWorkspaceCaseBundle({
  data,
  notifications,
  refresh,
  startTransition,
}: WorkspaceMutationContext) {
  startTransition(() => {
    void postJson("/api/ops/case-publish", { caseId: data.id })
      .then(() => {
        notifications.pushNotification(
          "Published case bundle to the shared published root.",
          "success",
        );
        refresh();
      })
      .catch((error) => {
        notifications.pushNotification(
          error instanceof Error ? error.message : "Failed to publish case.",
          "error",
        );
      });
  });
}

/**
 * Deploy remains single-flight on the client as well as the server lock so repeated taps cannot
 * queue duplicate Cloudflare deploys before the first request leaves the browser.
 */
export function deployWorkspacePublicSite({
  data,
  isDeployingPublicSite,
  notifications,
  setIsDeployingPublicSite,
  startTransition,
}: WorkspaceMutationContext & {
  isDeployingPublicSite: boolean;
  setIsDeployingPublicSite: (nextState: boolean) => void;
}) {
  if (isDeployingPublicSite) {
    return;
  }

  setIsDeployingPublicSite(true);
  notifications.pushNotification(
    "Republishing this case and deploying a fresh public export to Cloudflare Pages...",
    "info",
    {
      // Reuse a stable key so repeated deploy attempts update one sticky notification instead of
      // stacking transient duplicates.
      key: "workspace-deploying-public-site",
      sticky: true,
    },
  );

  startTransition(() => {
    void postJson("/api/ops/public-deploy", { caseId: data.id })
      .then((result) => {
        notifications.pushNotification(
          `Deployed fresh static export to Cloudflare Pages project ${result.projectName}.`,
          "success",
        );
      })
      .catch((error) => {
        notifications.pushNotification(
          error instanceof Error
            ? error.message
            : "Failed to deploy public site.",
          "error",
        );
      })
      .finally(() => {
        notifications.dismissNotification("workspace-deploying-public-site");
        setIsDeployingPublicSite(false);
      });
  });
}

/**
 * Reorder uses the latest live array instead of the render-time snapshot so overlapping drag
 * operations cannot persist an outdated ordering after a refresh or another optimistic change.
 */
export function reorderWorkspaceGroups(
  activeId: string,
  overId: string | null,
  {
    data,
    groupsRef,
    notifications,
    refresh,
    setGroups,
    startTransition,
  }: WorkspaceGroupMutationContext,
) {
  if (!overId || activeId === overId) {
    return;
  }

  const previousGroups = groupsRef.current;
  const oldIndex = previousGroups.findIndex((group) => group.id === activeId);
  const newIndex = previousGroups.findIndex((group) => group.id === overId);

  if (oldIndex === -1 || newIndex === -1) {
    return;
  }

  const reordered = arrayMove(previousGroups, oldIndex, newIndex).map(
    (group, order) => ({
      ...group,
      order,
    }),
  );

  replaceWorkspaceGroups(groupsRef, setGroups, reordered);
  notifications.showWorkspaceSavingNotification();

  startTransition(() => {
    void postJson("/api/ops/group-reorder", {
      caseId: data.id,
      groupIds: reordered.map((group) => group.id),
    })
      .then(() => {
        refresh();
      })
      .catch((error) => {
        replaceWorkspaceGroups(groupsRef, setGroups, previousGroups);
        notifications.pushNotification(
          error instanceof Error
            ? error.message
            : "Failed to persist group order.",
          "error",
        );
      })
      .finally(() => {
        notifications.dismissWorkspaceSavingNotification();
      });
  });
}
