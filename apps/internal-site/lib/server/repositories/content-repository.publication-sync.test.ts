import { beforeEach, describe, expect, it, vi } from "vitest";
import { reorderFrames, reorderGroups, setGroupVisibility } from "./content-repository";

const mocks = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  deletePublishedGroup: vi.fn(),
  frameUpdateMany: vi.fn(),
  groupCount: vi.fn(),
  groupFindUnique: vi.fn(),
  groupUpdate: vi.fn(),
  groupUpdateMany: vi.fn(),
  publishCase: vi.fn(),
  syncCasePublicationState: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    case: { findUnique: mocks.caseFindUnique },
    frame: { updateMany: mocks.frameUpdateMany },
    group: {
      count: mocks.groupCount,
      findUnique: mocks.groupFindUnique,
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
    mocks.groupCount.mockResolvedValue(1);

    await reorderGroups("case-1", ["group-2", "group-1"]);

    expect(mocks.publishCase).toHaveBeenCalledWith("case-1");
  });

  it("refreshes a public group after frame order changes", async () => {
    mocks.groupFindUnique.mockResolvedValue({ caseId: "case-1", isPublic: true });

    await reorderFrames("group-1", ["frame-2", "frame-1"]);

    expect(mocks.publishCase).toHaveBeenCalledWith("case-1");
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
