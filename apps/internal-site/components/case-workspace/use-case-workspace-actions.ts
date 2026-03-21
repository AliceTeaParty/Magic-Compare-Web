import type { TransitionStartFunction } from "react";
import { useMemo, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import type { WorkspaceNotificationTone } from "./use-workspace-notifications";

type GroupItem = CaseWorkspaceData["groups"][number];

interface NotificationApi {
  dismissNotification: (notificationId: string) => void;
  pushNotification: (
    message: string,
    tone: WorkspaceNotificationTone,
    options?: { key?: string; sticky?: boolean },
  ) => void;
  showWorkspaceSavingNotification: () => void;
  dismissWorkspaceSavingNotification: () => void;
}

/**
 * Normalizes JSON POST handling so workspace actions surface API errors with the same message
 * shape regardless of which operation triggered them.
 */
async function postJson(url: string, body: unknown) {
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
 * Keeps all workspace mutations in one hook so optimistic UI, notifications, and refresh timing
 * stay aligned across reorder/publish/deploy/visibility flows.
 */
export function useCaseWorkspaceActions({
  data,
  groups,
  setGroups,
  refresh,
  notifications,
  startTransition,
}: {
  data: CaseWorkspaceData;
  groups: GroupItem[];
  setGroups: (updater: GroupItem[] | ((current: GroupItem[]) => GroupItem[])) => void;
  refresh: () => void;
  notifications: NotificationApi;
  startTransition: TransitionStartFunction;
}) {
  const [isDeployingPublicSite, setIsDeployingPublicSite] = useState(false);
  const groupsRef = useRef(groups);

  // Async mutation handlers can outlive the render that scheduled them, so they need access to the
  // latest optimistic group list instead of whatever array the closure captured initially.
  groupsRef.current = groups;

  const publicGroupCount = useMemo(
    () => groups.filter((group) => group.isPublic).length,
    [groups],
  );

  /**
   * Keeps the ref and React state aligned so later optimistic mutations read the same latest
   * collection that the UI is currently rendering.
   */
  function replaceGroups(nextGroups: GroupItem[]) {
    groupsRef.current = nextGroups;
    setGroups(() => nextGroups);
  }

  /**
   * Restores the last confirmed snapshot after a failed mutation so drag/visibility rollbacks do
   * not reapply whichever optimistic array another in-flight request captured earlier.
   */
  function restoreGroups(previousGroups: GroupItem[]) {
    groupsRef.current = previousGroups;
    setGroups(() => previousGroups);
  }

  /**
   * Uses optimistic visibility updates because the control is binary and easy to roll back, which
   * makes workspace editing feel immediate without hiding persistence failures.
   */
  function toggleGroupVisibility(targetGroup: GroupItem) {
    const previousGroups = groupsRef.current;
    const liveTargetGroup = previousGroups.find((group) => group.id === targetGroup.id);

    if (!liveTargetGroup) {
      return;
    }

    const nextVisibility = !liveTargetGroup.isPublic;
    const nextGroups = previousGroups.map((group) =>
      group.id === targetGroup.id ? { ...group, isPublic: nextVisibility } : group,
    );

    replaceGroups(nextGroups);
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
          restoreGroups(previousGroups);
          notifications.pushNotification(
            error instanceof Error ? error.message : "Failed to update group visibility.",
            "error",
          );
        })
        .finally(() => {
          notifications.dismissWorkspaceSavingNotification();
        });
    });
  }

  /**
   * Publishes the case explicitly instead of tying it to every toggle/reorder so operators can
   * batch workspace edits before refreshing the public bundle.
   */
  function publishCaseBundle() {
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
   * Keeps deploy single-flight on the client as well as the server lock so repeated taps do not
   * spam Cloudflare deploys before the first request has even left the browser.
   */
  function deployPublicSite() {
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
            error instanceof Error ? error.message : "Failed to deploy public site.",
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
   * Mirrors drag-and-drop order optimistically and rolls back on failure so the workspace stays
   * responsive while still preserving the server as the source of truth.
   */
  function reorderCaseGroups(activeId: string, overId: string | null) {
    if (!overId || activeId === overId) {
      return;
    }

    const previousGroups = groupsRef.current;
    const oldIndex = previousGroups.findIndex((group) => group.id === activeId);
    const newIndex = previousGroups.findIndex((group) => group.id === overId);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reordered = arrayMove(previousGroups, oldIndex, newIndex).map((group, order) => ({
      ...group,
      order,
    }));

    replaceGroups(reordered);
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
          restoreGroups(previousGroups);
          notifications.pushNotification(
            error instanceof Error ? error.message : "Failed to persist group order.",
            "error",
          );
        })
        .finally(() => {
          notifications.dismissWorkspaceSavingNotification();
        });
    });
  }

  return {
    publicGroupCount,
    isDeployingPublicSite,
    toggleGroupVisibility,
    publishCaseBundle,
    deployPublicSite,
    reorderCaseGroups,
  };
}
