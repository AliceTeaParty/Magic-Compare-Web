import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelExpiredActiveUploadJobs,
  clearGroupForRestart,
  downgradeGroupVisibility,
} from "./upload-service-helpers";

const {
  transaction,
  frameUploadJobUpdateMany,
  frameUploadJobFindUnique,
  frameUploadJobCount,
  groupUploadJobUpdateMany,
  groupUploadJobFindMany,
  groupUploadJobFindFirst,
  groupUploadJobFindUnique,
  frameDeleteMany,
  groupUpdate,
  groupFindMany,
  caseUpdate,
  deletePublishedGroup,
  deleteInternalAssetPrefix,
  recomputeCaseCoverAsset,
  syncCasePublicationState,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  frameUploadJobUpdateMany: vi.fn(),
  frameUploadJobFindUnique: vi.fn(),
  frameUploadJobCount: vi.fn(),
  groupUploadJobUpdateMany: vi.fn(),
  groupUploadJobFindMany: vi.fn(),
  groupUploadJobFindFirst: vi.fn(),
  groupUploadJobFindUnique: vi.fn(),
  frameDeleteMany: vi.fn(),
  groupUpdate: vi.fn(),
  groupFindMany: vi.fn(),
  caseUpdate: vi.fn(),
  deletePublishedGroup: vi.fn(),
  deleteInternalAssetPrefix: vi.fn(),
  recomputeCaseCoverAsset: vi.fn(),
  syncCasePublicationState: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    $transaction: transaction,
    frameUploadJob: {
      updateMany: frameUploadJobUpdateMany,
      findUnique: frameUploadJobFindUnique,
      count: frameUploadJobCount,
    },
    groupUploadJob: {
      updateMany: groupUploadJobUpdateMany,
      findMany: groupUploadJobFindMany,
      findFirst: groupUploadJobFindFirst,
      findUnique: groupUploadJobFindUnique,
    },
    frame: {
      deleteMany: frameDeleteMany,
    },
    group: {
      update: groupUpdate,
      findMany: groupFindMany,
    },
    case: {
      update: caseUpdate,
    },
  },
}));

vi.mock("@/lib/server/storage/published-content", () => ({
  deletePublishedGroup,
}));

vi.mock("@/lib/server/storage/internal-assets", () => ({
  deleteInternalAssetPrefix,
  buildLogicalStoragePath: vi.fn(),
  createPresignedInternalAssetUpload: vi.fn(),
}));

vi.mock("@/lib/server/storage/internal-asset-sanity", () => ({
  assertLikelyImageAssetUrl: vi.fn(),
}));

vi.mock("@/lib/server/content/case-maintenance", () => ({
  recomputeCaseCoverAsset,
  syncCasePublicationState,
}));

describe("upload-service-helpers", () => {
  beforeEach(() => {
    transaction.mockReset();
    frameUploadJobUpdateMany.mockReset();
    frameUploadJobFindUnique.mockReset();
    frameUploadJobCount.mockReset();
    groupUploadJobUpdateMany.mockReset();
    groupUploadJobFindMany.mockReset();
    groupUploadJobFindFirst.mockReset();
    groupUploadJobFindUnique.mockReset();
    frameDeleteMany.mockReset();
    groupUpdate.mockReset();
    groupFindMany.mockReset();
    caseUpdate.mockReset();
    deletePublishedGroup.mockReset();
    deleteInternalAssetPrefix.mockReset();
    recomputeCaseCoverAsset.mockReset();
    syncCasePublicationState.mockReset();

    frameUploadJobUpdateMany.mockReturnValue("frame-upload-jobs");
    groupUploadJobUpdateMany.mockReturnValue("group-upload-jobs");
    frameDeleteMany.mockReturnValue("deleted-frames");
    groupUpdate.mockReturnValue("updated-group");
    transaction.mockResolvedValue(undefined);
    groupUploadJobFindMany.mockResolvedValue([]);
    deletePublishedGroup.mockResolvedValue(undefined);
    deleteInternalAssetPrefix.mockResolvedValue(undefined);
    recomputeCaseCoverAsset.mockResolvedValue(undefined);
    syncCasePublicationState.mockResolvedValue(undefined);
  });

  it("recomputes case state after downgrading a public group", async () => {
    await downgradeGroupVisibility({
      caseId: "case-1",
      groupId: "group-1",
      publicSlug: "2026--group-a",
      wasPublic: true,
    });

    expect(deletePublishedGroup).toHaveBeenCalledWith("2026--group-a");
    expect(groupUpdate).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: {
        isPublic: false,
      },
    });
    expect(recomputeCaseCoverAsset).toHaveBeenCalledWith("case-1");
    expect(syncCasePublicationState).toHaveBeenCalledWith("case-1");
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it("recomputes case state after clearing a group for restart", async () => {
    await clearGroupForRestart({
      caseId: "case-1",
      groupId: "group-1",
      storageRoot: "/groups/group-1",
      publicSlug: "2026--group-a",
      wasPublic: true,
    });

    expect(transaction).toHaveBeenCalledWith([
      "frame-upload-jobs",
      "group-upload-jobs",
      "deleted-frames",
      "updated-group",
    ]);
    expect(deletePublishedGroup).toHaveBeenCalledWith("2026--group-a");
    expect(deleteInternalAssetPrefix).toHaveBeenCalledWith("/groups/group-1");
    expect(recomputeCaseCoverAsset).toHaveBeenCalledWith("case-1");
    expect(syncCasePublicationState).toHaveBeenCalledWith("case-1");
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it("cancels expired active upload jobs before start resumes work", async () => {
    groupUploadJobFindMany.mockResolvedValue([{ id: "job-1" }, { id: "job-2" }]);

    await cancelExpiredActiveUploadJobs("group-1", new Date("2026-03-29T10:00:00.000Z"));

    expect(groupUploadJobFindMany).toHaveBeenCalledWith({
      where: {
        groupId: "group-1",
        status: "active",
        expiresAt: {
          not: null,
          lte: new Date("2026-03-29T10:00:00.000Z"),
        },
      },
      select: {
        id: true,
      },
    });
    expect(transaction).toHaveBeenCalledWith([
      "frame-upload-jobs",
      "group-upload-jobs",
    ]);
    expect(frameUploadJobUpdateMany).toHaveBeenCalledWith({
      where: {
        groupUploadJobId: {
          in: ["job-1", "job-2"],
        },
      },
      data: {
        status: "cancelled",
      },
    });
    expect(groupUploadJobUpdateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["job-1", "job-2"],
        },
      },
      data: {
        status: "cancelled",
      },
    });
  });

  it("skips cancellation work when no expired active jobs exist", async () => {
    groupUploadJobFindMany.mockResolvedValue([]);

    await cancelExpiredActiveUploadJobs("group-1");

    expect(transaction).not.toHaveBeenCalled();
    expect(frameUploadJobUpdateMany).not.toHaveBeenCalled();
    expect(groupUploadJobUpdateMany).not.toHaveBeenCalled();
  });
});
