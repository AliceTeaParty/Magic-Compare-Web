import { useMemo, useRef } from "react";
import type { TransitionStartFunction } from "react";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import {
  deployWorkspacePublicSite,
  type NotificationApi,
  publishWorkspaceCaseBundle,
  reorderWorkspaceGroups,
  toggleWorkspaceGroupVisibility,
  type WorkspaceGroupMutationContext,
  type WorkspaceMutationContext,
} from "./workspace-action-helpers";

type GroupItem = CaseWorkspaceData["groups"][number];

/**
 * Keeps the mutable refs and action wiring close to the helper layer so the exported workspace
 * hook can stay focused on the state it actually owns.
 */
export function useWorkspaceActionHandlers({
  data,
  groups,
  isDeployingPublicSite,
  notifications,
  refresh,
  setGroups,
  setIsDeployingPublicSite,
  startTransition,
}: {
  data: CaseWorkspaceData;
  groups: GroupItem[];
  isDeployingPublicSite: boolean;
  notifications: NotificationApi;
  refresh: () => void;
  setGroups: (
    updater: GroupItem[] | ((current: GroupItem[]) => GroupItem[]),
  ) => void;
  setIsDeployingPublicSite: (nextState: boolean) => void;
  startTransition: TransitionStartFunction;
}) {
  const groupsRef = useRef(groups);

  // Async mutation handlers can outlive the render that scheduled them, so they need access to the
  // latest optimistic group list instead of whatever array the closure captured initially.
  groupsRef.current = groups;

  const publicGroupCount = useMemo(
    () => groups.filter((group) => group.isPublic).length,
    [groups],
  );
  const mutationContext: WorkspaceMutationContext = {
    data,
    notifications,
    refresh,
    startTransition,
  };
  const groupMutationContext: WorkspaceGroupMutationContext = {
    ...mutationContext,
    groupsRef,
    setGroups,
  };

  /**
   * Uses optimistic visibility updates because the control is binary and easy to roll back, which
   * makes workspace editing feel immediate without hiding persistence failures.
   */
  function toggleGroupVisibility(targetGroup: GroupItem) {
    toggleWorkspaceGroupVisibility(targetGroup, groupMutationContext);
  }

  /**
   * Publishes the case explicitly instead of tying it to every toggle/reorder so operators can
   * batch workspace edits before refreshing the public bundle.
   */
  function publishCaseBundle() {
    publishWorkspaceCaseBundle(mutationContext);
  }

  /**
   * Keeps deploy single-flight on the client as well as the server lock so repeated taps do not
   * spam Cloudflare deploys before the first request has even left the browser.
   */
  function deployPublicSite() {
    deployWorkspacePublicSite({
      ...mutationContext,
      isDeployingPublicSite,
      setIsDeployingPublicSite,
    });
  }

  /**
   * Mirrors drag-and-drop order optimistically and rolls back on failure so the workspace stays
   * responsive while still preserving the server as the source of truth.
   */
  function reorderCaseGroups(activeId: string, overId: string | null) {
    reorderWorkspaceGroups(activeId, overId, groupMutationContext);
  }

  return {
    publicGroupCount,
    toggleGroupVisibility,
    publishCaseBundle,
    deployPublicSite,
    reorderCaseGroups,
  };
}
