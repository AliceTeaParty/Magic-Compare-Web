import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGroupForRestart,
  downgradeGroupVisibility,
} from "./upload-service-helpers";

const {
  transaction,
  frameUploadJobUpdateMany,
  groupUploadJobUpdateMany,
  frameDeleteMany,
  groupUpdate,
  caseUpdate,
  deletePublishedGroup,
  deleteInternalAssetPrefix,
  recomputeCaseCoverAsset,
  syncCasePublicationState,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  frameUploadJobUpdateMany: vi.fn(),
  groupUploadJobUpdateMany: vi.fn(),
  frameDeleteMany: vi.fn(),
  groupUpdate: vi.fn(),
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
    },
    groupUploadJob: {
      updateMany: groupUploadJobUpdateMany,
    },
    frame: {
      deleteMany: frameDeleteMany,
    },
    group: {
      update: groupUpdate,
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
    groupUploadJobUpdateMany.mockReset();
    frameDeleteMany.mockReset();
    groupUpdate.mockReset();
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
});
