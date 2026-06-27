import type { TransitionStartFunction } from "react";
import { useState } from "react";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import { type NotificationApi } from "./workspace-action-helpers";
import { useWorkspaceActionHandlers } from "./use-workspace-action-handlers";

type GroupItem = CaseWorkspaceData["groups"][number];

/**
 * Keeps all workspace mutations in one hook so optimistic UI, notifications, and refresh timing
 * stay aligned across reorder/publish/deploy/visibility flows.
 */
export function useCaseWorkspaceActions({
  caseSummary,
  data,
  groups,
  setGroups,
  setCaseSummary,
  refresh,
  notifications,
  startTransition,
}: {
  caseSummary: string;
  data: CaseWorkspaceData;
  groups: GroupItem[];
  setGroups: (
    updater: GroupItem[] | ((current: GroupItem[]) => GroupItem[]),
  ) => void;
  setCaseSummary: (nextSummary: string) => void;
  refresh: () => void;
  notifications: NotificationApi;
  startTransition: TransitionStartFunction;
}) {
  const [isDeployingPublicSite, setIsDeployingPublicSite] = useState(false);
  const actionHandlers = useWorkspaceActionHandlers({
    caseSummary,
    data,
    groups,
    isDeployingPublicSite,
    notifications,
    refresh,
    setCaseSummary,
    setGroups,
    setIsDeployingPublicSite,
    startTransition,
  });

  return {
    ...actionHandlers,
    isDeployingPublicSite,
  };
}
