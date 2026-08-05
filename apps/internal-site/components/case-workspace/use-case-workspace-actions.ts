import type { TransitionStartFunction } from "react";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import { type NotificationApi } from "./workspace-action-helpers";
import { useWorkspaceActionHandlers } from "./use-workspace-action-handlers";

type GroupItem = CaseWorkspaceData["groups"][number];

/**
 * Keeps all workspace mutations in one hook so optimistic UI, notifications, and refresh timing
 * stay aligned across reorder, metadata, deletion, and visibility flows.
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
  setGroups: (updater: GroupItem[] | ((current: GroupItem[]) => GroupItem[])) => void;
  setCaseSummary: (nextSummary: string) => void;
  refresh: () => void;
  notifications: NotificationApi;
  startTransition: TransitionStartFunction;
}) {
  return useWorkspaceActionHandlers({
    caseSummary,
    data,
    groups,
    notifications,
    refresh,
    setCaseSummary,
    setGroups,
    startTransition,
  });
}
