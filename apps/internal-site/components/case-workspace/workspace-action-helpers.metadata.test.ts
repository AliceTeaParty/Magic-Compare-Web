import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import {
  updateWorkspaceCaseSummary,
  updateWorkspaceGroupMetadata,
  type NotificationApi,
  type WorkspaceCaseMetadataMutationContext,
  type WorkspaceGroupMutationContext,
} from "./workspace-action-helpers";

type GroupItem = CaseWorkspaceData["groups"][number];

const baseGroup = {
  id: "group-1",
  slug: "comparison",
  title: "Comparison",
  description: "Imported from comparison.",
  defaultMode: "before-after",
  isPublic: true,
  order: 0,
  publicSlug: "comparison-public",
  frameCount: 84,
} satisfies GroupItem;

const baseCase = {
  id: "case-1",
  slug: "mono",
  title: "mono",
  summary: "Original summary",
  status: "published",
  publishedAt: "2026-06-28T00:00:00.000Z",
  tags: [],
  groups: [baseGroup],
} satisfies CaseWorkspaceData;

function createNotificationApi(): NotificationApi {
  return {
    dismissNotification: vi.fn(),
    dismissWorkspaceSavingNotification: vi.fn(),
    pushNotification: vi.fn(),
    showWorkspaceSavingNotification: vi.fn(),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("workspace metadata actions", () => {
  it("saves case summary without triggering a workspace refresh transition", async () => {
    const notifications = createNotificationApi();
    const refresh = vi.fn();
    const startTransition = vi.fn();
    const setCaseSummary = vi.fn();
    const summaryRef = { current: "Original summary" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        caseSlug: "mono",
        summary: "Updated summary",
      }),
    } as Response);
    const context = {
      data: baseCase,
      notifications,
      refresh,
      setCaseSummary,
      startTransition,
      summaryRef,
    } satisfies WorkspaceCaseMetadataMutationContext;

    updateWorkspaceCaseSummary(" Updated summary ", context);
    await vi.waitFor(() => {
      expect(notifications.pushNotification).toHaveBeenCalledWith(
        "Case 描述已保存。",
        "success",
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ops/case-update",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          caseSlug: "mono",
          summary: "Updated summary",
        }),
      }),
    );
    expect(setCaseSummary).toHaveBeenNthCalledWith(1, "Updated summary");
    expect(setCaseSummary).toHaveBeenLastCalledWith("Updated summary");
    expect(summaryRef.current).toBe("Updated summary");
    expect(refresh).not.toHaveBeenCalled();
    expect(startTransition).not.toHaveBeenCalled();
  });

  it("saves group metadata locally without triggering a workspace refresh transition", async () => {
    const notifications = createNotificationApi();
    const refresh = vi.fn();
    const startTransition = vi.fn();
    const previousGroups: GroupItem[] = [baseGroup];
    const groupsRef = { current: previousGroups };
    const setGroups = vi.fn(
      (updater: GroupItem[] | ((current: GroupItem[]) => GroupItem[])) => {
        groupsRef.current =
          typeof updater === "function" ? updater(groupsRef.current) : updater;
      },
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        caseSlug: "mono",
        groupSlug: "comparison",
        title: "New title",
        description: "New description",
      }),
    } as Response);
    const context = {
      data: baseCase,
      groupsRef,
      notifications,
      refresh,
      setGroups,
      startTransition,
    } satisfies WorkspaceGroupMutationContext;

    updateWorkspaceGroupMetadata(
      baseGroup,
      {
        title: " New title ",
        description: " New description ",
      },
      context,
    );
    await vi.waitFor(() => {
      expect(notifications.pushNotification).toHaveBeenCalledWith(
        "元数据已保存。发布 Case 后会更新公开页面。",
        "success",
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ops/group-update",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          caseSlug: "mono",
          groupSlug: "comparison",
          title: "New title",
          description: "New description",
        }),
      }),
    );
    expect(groupsRef.current).toEqual([
      {
        ...baseGroup,
        title: "New title",
        description: "New description",
      },
    ]);
    expect(refresh).not.toHaveBeenCalled();
    expect(startTransition).not.toHaveBeenCalled();
  });
});
