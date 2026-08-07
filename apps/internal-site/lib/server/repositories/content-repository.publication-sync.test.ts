import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "@/lib/server/api/errors";
import { reorderGroups, setGroupVisibility } from "./content-repository";

const mocks = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  deletePublishedGroup: vi.fn(),
  groupCount: vi.fn(),
  groupFindMany: vi.fn(),
  groupUpdate: vi.fn(),
  groupUpdateMany: vi.fn(),
  publishCase: vi.fn(),
  syncCasePublicationState: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    case: { findUnique: mocks.caseFindUnique },
    group: {
      count: mocks.groupCount,
      findMany: mocks.groupFindMany,
      update: mocks.groupUpdate,
      updateMany: mocks.groupUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/server/publish/publish-case", () => ({ publishCase: mocks.publishCase }));
vi.mock("@/lib/server/storage/published-content", () => ({
  deletePublishedGroup: mocks.deletePublishedGroup,
}));
vi.mock("@/lib/server/content/case-maintenance", () => ({
  recomputeCaseCoverAsset: vi.fn(),
  syncCasePublicationState: mocks.syncCasePublicationState,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockResolvedValue(undefined);
});

describe("published manifest synchronization", () => {
  it("refreshes public manifests after group order changes", async () => {
    mocks.groupFindMany.mockResolvedValue([{ id: "group-1" }, { id: "group-2" }]);
    mocks.groupCount.mockResolvedValue(1);

    await reorderGroups("case-1", ["group-2", "group-1"]);

    expect(mocks.publishCase).toHaveBeenCalledWith("case-1");
  });

  it.each([
    ["duplicate ids", ["group-1", "group-1"]],
    ["missing ids", ["group-1"]],
    ["foreign ids", ["group-1", "group-foreign"]],
  ])("rejects %s before writing or publishing", async (_label, groupIds) => {
    mocks.groupFindMany.mockResolvedValue([{ id: "group-1" }, { id: "group-2" }]);

    await expect(reorderGroups("case-1", groupIds)).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.groupUpdateMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.groupCount).not.toHaveBeenCalled();
    expect(mocks.publishCase).not.toHaveBeenCalled();
  });

  it("removes the bundle and clears publication state for the last hidden group", async () => {
    mocks.caseFindUnique.mockResolvedValue({
      id: "case-1",
      slug: "mono",
      groups: [
        {
          id: "group-1",
          slug: "comparison",
          isPublic: true,
          publicSlug: "mono--comparison",
        },
      ],
    });
    mocks.groupCount.mockResolvedValue(0);

    await setGroupVisibility("mono", "comparison", false);

    expect(mocks.deletePublishedGroup).toHaveBeenCalledWith("mono--comparison");
    expect(mocks.publishCase).not.toHaveBeenCalled();
    expect(mocks.syncCasePublicationState).toHaveBeenCalledWith("case-1");
  });
});
