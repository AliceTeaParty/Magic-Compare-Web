import type { MutableRefObject, TransitionStartFunction } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import { postJson } from "@/lib/client/internal-api";
import type { AppNotificationTone } from "../notifications/use-app-notifications";

export interface WorkspaceMutationResult {
  warnings?: string[];
}

/** A successful commit with failed publication must keep the saved UI value and show the warning. */
function showMutationWarnings(result: WorkspaceMutationResult, notifications: NotificationApi) {
  if (!result.warnings?.length) return false;
  notifications.pushNotification(result.warnings.join("\n"), "warning", { sticky: true });
  return true;
}

type GroupItem = CaseWorkspaceData["groups"][number];

export interface NotificationApi {
  dismissNotification: (notificationId: string) => void;
  pushNotification: (
    message: string,
    tone: AppNotificationTone,
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

export interface WorkspaceGroupMutationContext extends WorkspaceMutationContext {
  groupsRef: MutableRefObject<GroupItem[]>;
  setGroups: (updater: GroupItem[] | ((current: GroupItem[]) => GroupItem[])) => void;
}

export interface WorkspaceCaseMetadataMutationContext extends WorkspaceMutationContext {
  setCaseSummary: (nextSummary: string) => void;
  summaryRef: MutableRefObject<string>;
}

/**
 * Optimistic mutations need one shared state writer so the live ref and React state never diverge,
 * otherwise later requests can roll back to a snapshot the UI is no longer showing.
 */
function replaceWorkspaceGroups(
  groupsRef: MutableRefObject<GroupItem[]>,
  setGroups: (updater: GroupItem[] | ((current: GroupItem[]) => GroupItem[])) => void,
  nextGroups: GroupItem[],
) {
  groupsRef.current = nextGroups;
  setGroups(() => nextGroups);
}

/**
 * Keeps fallback error formatting in one place so every workspace action surfaces the same shape
 * when the server fails before returning a structured error payload.
 */
function pushWorkspaceError(
  notifications: NotificationApi,
  error: unknown,
  fallbackMessage: string,
) {
  notifications.pushNotification(error instanceof Error ? error.message : fallbackMessage, "error");
}

/**
 * Wraps async mutations in one transition helper so UI actions do not each need to repeat the same
 * fire-and-forget transition boilerplate.
 */
function runWorkspaceTransition(
  startTransition: TransitionStartFunction,
  action: () => Promise<void>,
) {
  startTransition(() => {
    void action();
  });
}

/**
 * Reuses one optimistic group-mutation flow for both visibility toggles and drag reorder so local
 * state replacement, rollback, refresh, and save-indicator cleanup cannot drift apart.
 */
function runOptimisticGroupMutation<T extends WorkspaceMutationResult>({
  fallbackErrorMessage,
  nextGroups,
  onSuccess,
  previousGroups,
  request,
  context,
}: {
  fallbackErrorMessage: string;
  nextGroups: GroupItem[];
  onSuccess?: (result: T) => void;
  previousGroups: GroupItem[];
  request: () => Promise<T>;
  context: WorkspaceGroupMutationContext;
}) {
  replaceWorkspaceGroups(context.groupsRef, context.setGroups, nextGroups);
  context.notifications.showWorkspaceSavingNotification();

  runWorkspaceTransition(context.startTransition, async () => {
    try {
      const result = await request();
      if (!showMutationWarnings(result, context.notifications)) onSuccess?.(result);
      context.refresh();
    } catch (error) {
      replaceWorkspaceGroups(context.groupsRef, context.setGroups, previousGroups);
      pushWorkspaceError(context.notifications, error, fallbackErrorMessage);
    } finally {
      context.notifications.dismissWorkspaceSavingNotification();
    }
  });
}

/**
 * Builds the next visibility snapshot from the latest live groups so stale renders cannot invert
 * an already-changed group back to the wrong public state.
 */
function buildVisibilityGroups(
  previousGroups: GroupItem[],
  targetGroupId: string,
  nextVisibility: boolean,
) {
  return previousGroups.map((group) =>
    group.id === targetGroupId ? { ...group, isPublic: nextVisibility } : group,
  );
}

/**
 * Reorders the latest live group array instead of the render-time snapshot so overlapping drag
 * operations cannot persist an outdated order after another optimistic change lands first.
 */
function buildReorderedGroups(previousGroups: GroupItem[], activeId: string, overId: string) {
  const oldIndex = previousGroups.findIndex((group) => group.id === activeId);
  const newIndex = previousGroups.findIndex((group) => group.id === overId);

  if (oldIndex === -1 || newIndex === -1) {
    return null;
  }

  return arrayMove(previousGroups, oldIndex, newIndex).map((group, order) => ({
    ...group,
    order,
  }));
}

/**
 * Visibility toggles stay optimistic because the action is binary and easy to undo, which keeps
 * workspace editing responsive without hiding persistence failures.
 */
export function toggleWorkspaceGroupVisibility(
  targetGroup: GroupItem,
  context: WorkspaceGroupMutationContext,
) {
  const previousGroups = context.groupsRef.current;
  const liveTargetGroup = previousGroups.find((group) => group.id === targetGroup.id);

  if (!liveTargetGroup) {
    return;
  }

  const nextVisibility = !liveTargetGroup.isPublic;
  runOptimisticGroupMutation({
    fallbackErrorMessage: "Failed to update group visibility.",
    nextGroups: buildVisibilityGroups(previousGroups, targetGroup.id, nextVisibility),
    onSuccess: () => {
      context.notifications.pushNotification(
        nextVisibility
          ? `Marked ${targetGroup.title} as public.`
          : `Marked ${targetGroup.title} as internal.`,
        "success",
      );
    },
    previousGroups,
    request: async () =>
      postJson<WorkspaceMutationResult>("/api/ops/group-visibility", {
        caseSlug: context.data.slug,
        groupSlug: targetGroup.slug,
        isPublic: nextVisibility,
      }),
    context,
  });
}

/**
 * Case summary edits are optimistic because the value is a single text field and can be restored
 * exactly if the server rejects the update.
 */
export function updateWorkspaceCaseSummary(
  nextSummary: string,
  context: WorkspaceCaseMetadataMutationContext,
) {
  const previousSummary = context.summaryRef.current;
  const normalizedSummary = nextSummary.trim();

  context.summaryRef.current = normalizedSummary;
  context.setCaseSummary(normalizedSummary);
  context.notifications.showWorkspaceSavingNotification();

  return (async () => {
    try {
      const result = await postJson<WorkspaceMutationResult & { summary: string }>(
        "/api/ops/case-update",
        {
          caseSlug: context.data.slug,
          summary: normalizedSummary,
        },
      );
      const savedSummary = result.summary;

      context.summaryRef.current = savedSummary;
      context.setCaseSummary(savedSummary);
      if (showMutationWarnings(result, context.notifications)) context.refresh();
      else context.notifications.pushNotification("项目描述已保存。", "success");
    } catch (error) {
      context.summaryRef.current = previousSummary;
      context.setCaseSummary(previousSummary);
      pushWorkspaceError(context.notifications, error, "保存项目描述失败。");
    } finally {
      context.notifications.dismissWorkspaceSavingNotification();
    }
  })();
}

/**
 * Group metadata edits update the row immediately but keep slug/order/publish fields intact; a
 * failed request restores the exact previous group snapshot.
 */
export function updateWorkspaceGroupMetadata(
  targetGroup: GroupItem,
  metadata: { title: string; description: string },
  context: WorkspaceGroupMutationContext,
) {
  const title = metadata.title.trim();
  const description = metadata.description.trim();

  if (!title) {
    context.notifications.pushNotification("图组标题不能为空。", "error");
    return Promise.resolve();
  }

  const previousGroups = context.groupsRef.current;
  const nextGroups = previousGroups.map((group) =>
    group.id === targetGroup.id
      ? {
          ...group,
          title,
          description,
        }
      : group,
  );

  replaceWorkspaceGroups(context.groupsRef, context.setGroups, nextGroups);
  context.notifications.showWorkspaceSavingNotification();

  return (async () => {
    try {
      const result = await postJson<
        WorkspaceMutationResult & { title: string; description: string }
      >("/api/ops/group-update", {
        caseSlug: context.data.slug,
        groupSlug: targetGroup.slug,
        title,
        description,
      });
      const savedTitle = result.title;
      const savedDescription = result.description;
      const savedGroups = context.groupsRef.current.map((group) =>
        group.id === targetGroup.id
          ? {
              ...group,
              title: savedTitle,
              description: savedDescription,
            }
          : group,
      );

      replaceWorkspaceGroups(context.groupsRef, context.setGroups, savedGroups);
      if (showMutationWarnings(result, context.notifications)) context.refresh();
      else context.notifications.pushNotification("图组元数据已保存。", "success");
    } catch (error) {
      replaceWorkspaceGroups(context.groupsRef, context.setGroups, previousGroups);
      pushWorkspaceError(context.notifications, error, "保存图组元数据失败。");
    } finally {
      context.notifications.dismissWorkspaceSavingNotification();
    }
  })();
}

/**
 * Deletes optimistically because removal is visually obvious, but still refreshes afterward: the
 * server also cleans storage/publication metadata that the local row list cannot infer safely.
 */
export function deleteWorkspaceGroup(
  targetGroup: GroupItem,
  context: WorkspaceGroupMutationContext,
) {
  const previousGroups = context.groupsRef.current;
  const nextGroups = previousGroups.filter((group) => group.id !== targetGroup.id);

  if (nextGroups.length === previousGroups.length) {
    return;
  }

  runOptimisticGroupMutation({
    fallbackErrorMessage: "删除图组失败。",
    nextGroups,
    onSuccess: () => {
      context.notifications.pushNotification("图组已删除。", "success");
    },
    previousGroups,
    request: async () =>
      postJson<WorkspaceMutationResult>("/api/ops/group-delete", {
        caseSlug: context.data.slug,
        groupSlug: targetGroup.slug,
      }),
    context,
  });
}

/**
 * Reorder uses the latest live array instead of the render-time snapshot so overlapping drag
 * operations cannot persist an outdated ordering after a refresh or another optimistic change.
 */
export function reorderWorkspaceGroups(
  activeId: string,
  overId: string | null,
  context: WorkspaceGroupMutationContext,
) {
  if (!overId || activeId === overId) {
    return;
  }

  const previousGroups = context.groupsRef.current;
  const reordered = buildReorderedGroups(previousGroups, activeId, overId);

  if (!reordered) {
    return;
  }

  runOptimisticGroupMutation({
    fallbackErrorMessage: "Failed to reorder groups.",
    nextGroups: reordered,
    previousGroups,
    request: async () =>
      postJson<WorkspaceMutationResult>("/api/ops/group-reorder", {
        caseId: context.data.id,
        groupIds: reordered.map((group) => group.id),
      }),
    context,
  });
}
