import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelGroupUpload,
  commitGroupUploadFrame,
  completeGroupUpload,
  prepareGroupUploadFrame,
  startGroupUpload,
} from "./upload-service";
import { StorageValidationError } from "@/lib/server/api/errors";

const {
  groupUploadJobCreate,
  groupUploadJobUpdate,
  groupUploadJobUpdateMany,
  frameUploadJobFindMany,
  frameUploadJobUpdate,
  frameUploadJobUpdateMany,
  frameFindMany,
  frameDeleteMany,
  frameCreate,
  caseUpdate,
  transaction,
} = vi.hoisted(() => ({
  groupUploadJobCreate: vi.fn(),
  groupUploadJobUpdate: vi.fn(),
  groupUploadJobUpdateMany: vi.fn(),
  frameUploadJobFindMany: vi.fn(),
  frameUploadJobUpdate: vi.fn(),
  frameUploadJobUpdateMany: vi.fn(),
  frameFindMany: vi.fn(),
  frameDeleteMany: vi.fn(),
  frameCreate: vi.fn(),
  caseUpdate: vi.fn(),
  transaction: vi.fn(),
}));

const helperMocks = vi.hoisted(() => ({
  cancelExpiredActiveUploadJobs: vi.fn(),
  findActiveUploadJobByGroup: vi.fn(),
  summarizeUploadJob: vi.fn(),
  ensureCaseAndGroup: vi.fn(),
  downgradeGroupVisibility: vi.fn(),
  clearGroupForRestart: vi.fn(),
  requireActiveFrameUploadJob: vi.fn(),
  buildPreparedUploadAssets: vi.fn(),
  buildPresignedFiles: vi.fn(),
  buildFramePendingPrefix: vi.fn(),
  assertFrameCanPrepare: vi.fn(),
  assertFrameCanCommit: vi.fn(),
  assertPreparedAssetsUploaded: vi.fn(),
  deleteReplacedFramePrefixes: vi.fn(),
  requireActiveUploadJob: vi.fn(),
  countUncommittedFrameJobs: vi.fn(),
  markUploadJobCompleted: vi.fn(),
}));

const { deleteInternalAssetPrefix } = vi.hoisted(() => ({
  deleteInternalAssetPrefix: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    groupUploadJob: {
      create: groupUploadJobCreate,
      update: groupUploadJobUpdate,
      updateMany: groupUploadJobUpdateMany,
    },
    frameUploadJob: {
      findMany: frameUploadJobFindMany,
      update: frameUploadJobUpdate,
      updateMany: frameUploadJobUpdateMany,
    },
    frame: {
      findMany: frameFindMany,
      deleteMany: frameDeleteMany,
      create: frameCreate,
    },
    case: {
      update: caseUpdate,
    },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/server/storage/internal-assets", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/storage/internal-assets")>(
    "@/lib/server/storage/internal-assets",
  );

  return {
    ...actual,
    deleteInternalAssetPrefix,
  };
});

vi.mock("./upload-job-repository", async () => {
  const actual =
    await vi.importActual<typeof import("./upload-job-repository")>("./upload-job-repository");
  return {
    ...actual,
    cancelExpiredActiveUploadJobs: helperMocks.cancelExpiredActiveUploadJobs,
    findActiveUploadJobByGroup: helperMocks.findActiveUploadJobByGroup,
    summarizeUploadJob: helperMocks.summarizeUploadJob,
    requireActiveFrameUploadJob: helperMocks.requireActiveFrameUploadJob,
    requireActiveUploadJob: helperMocks.requireActiveUploadJob,
    countUncommittedFrameJobs: helperMocks.countUncommittedFrameJobs,
    markUploadJobCompleted: helperMocks.markUploadJobCompleted,
  };
});

vi.mock("./upload-group-lifecycle", async () => {
  const actual = await vi.importActual<typeof import("./upload-group-lifecycle")>(
    "./upload-group-lifecycle",
  );
  return {
    ...actual,
    ensureCaseAndGroup: helperMocks.ensureCaseAndGroup,
    downgradeGroupVisibility: helperMocks.downgradeGroupVisibility,
    clearGroupForRestart: helperMocks.clearGroupForRestart,
  };
});

vi.mock("./upload-storage-operations", async () => {
  const actual = await vi.importActual<typeof import("./upload-storage-operations")>(
    "./upload-storage-operations",
  );
  return {
    ...actual,
    buildFramePendingPrefix: helperMocks.buildFramePendingPrefix,
    buildPreparedUploadAssets: helperMocks.buildPreparedUploadAssets,
    buildPresignedFiles: helperMocks.buildPresignedFiles,
    assertFrameCanPrepare: helperMocks.assertFrameCanPrepare,
    assertFrameCanCommit: helperMocks.assertFrameCanCommit,
    assertPreparedAssetsUploaded: helperMocks.assertPreparedAssetsUploaded,
    deleteReplacedFramePrefixes: helperMocks.deleteReplacedFramePrefixes,
  };
});

/** Builds a retry-shaped stream job so tests keep the immutable source and prepared output distinct. */
function streamPrepareFixture(afterSlot = "slot-002") {
  const original = {
    extension: ".png",
    contentType: "image/png",
    sha256: "a".repeat(64),
    size: 100,
  };
  const thumbnail = {
    extension: ".webp",
    contentType: "image/webp",
    sha256: "b".repeat(64),
    size: 20,
  };
  const sourceAssets = [
    {
      slot: "slot-001",
      kind: "before" as const,
      label: "Before",
      note: "",
      width: 1920,
      height: 1080,
      isPrimaryDisplay: true,
      original,
    },
    {
      slot: "slot-002",
      kind: "after" as const,
      label: "After",
      note: "",
      width: 1920,
      height: 1080,
      isPrimaryDisplay: true,
      original,
    },
  ];
  const sourceFrame = {
    order: 0,
    title: "Frame 1",
    caption: "",
    assets: sourceAssets,
    generatedHeatmap: {
      slot: "slot-003",
      beforeSlot: "slot-001",
      afterSlot,
    },
  };
  const generatedFrame = {
    order: sourceFrame.order,
    title: sourceFrame.title,
    caption: sourceFrame.caption,
    assets: [
      ...sourceAssets.map((asset) => ({ ...asset, thumbnail })),
      {
        slot: "slot-003",
        kind: "heatmap" as const,
        label: "Heatmap",
        note: "generated",
        width: 1920,
        height: 1080,
        isPrimaryDisplay: false,
        original: { ...original, sha256: "d".repeat(64) },
        thumbnail,
      },
    ],
  };
  const previousGeneratedFrame = {
    ...generatedFrame,
    assets: generatedFrame.assets.map((asset) =>
      asset.slot === "slot-003"
        ? { ...asset, original: { ...asset.original, sha256: "c".repeat(64) } }
        : asset,
    ),
  };

  return {
    generatedFrame,
    frameJob: {
      id: "frame-job-1",
      frameOrder: 0,
      // A failed PUT leaves the previous generated output here; validation must use snapshotJson.
      frameSnapshotJson: JSON.stringify(previousGeneratedFrame),
      preparedAssetsJson: "",
      pendingPrefix: null,
      status: "pending",
      groupUploadJob: {
        id: "job-1",
        snapshotJson: JSON.stringify({
          protocol: "stream-v2",
          case: {
            slug: "2026",
            title: "2026",
            summary: "",
            tags: [],
            coverAssetLabel: null,
          },
          group: {
            slug: "test-group",
            title: "Test Group",
            description: "",
            order: 0,
            defaultMode: "before-after",
            tags: [],
          },
          frames: [sourceFrame],
          forceRestart: false,
        }),
        inputHash: "hash-1",
        expectedFrameCount: 1,
        committedFrameCount: 0,
        status: "active",
        expiresAt: null,
        case: { id: "case-1", slug: "2026" },
        group: { id: "group-1", slug: "test-group", storageRoot: "/groups/group-1" },
      },
    },
  };
}

describe("upload-service", () => {
  beforeEach(() => {
    groupUploadJobCreate.mockReset();
    groupUploadJobUpdate.mockReset();
    groupUploadJobUpdateMany.mockReset();
    frameUploadJobFindMany.mockReset();
    frameUploadJobUpdate.mockReset();
    frameUploadJobUpdateMany.mockReset();
    frameFindMany.mockReset();
    frameDeleteMany.mockReset();
    frameCreate.mockReset();
    caseUpdate.mockReset();
    transaction.mockReset();
    transaction.mockImplementation(async (operation) => {
      if (typeof operation !== "function") {
        return undefined;
      }

      return operation({
        frameUploadJob: { updateMany: frameUploadJobUpdateMany },
        frame: { deleteMany: frameDeleteMany, create: frameCreate },
        case: { update: caseUpdate },
        groupUploadJob: { update: groupUploadJobUpdate },
      });
    });

    Object.values(helperMocks).forEach((mockFn) => mockFn.mockReset());
    deleteInternalAssetPrefix.mockReset();
  });

  it("validates upload identity before invoking persistence helpers", async () => {
    const invalidInput = {
      case: {
        slug: "bad--case",
        title: "Bad case",
        summary: "",
        tags: [],
        coverAssetLabel: null,
      },
      group: {
        slug: "test-group",
        title: "Test Group",
        description: "",
        order: 0,
        defaultMode: "before-after",
        tags: [],
      },
      frames: [
        {
          order: 0,
          title: "Frame 1",
          caption: "",
          assets: ["before", "after"].map((kind, index) => ({
            slot: kind,
            kind,
            label: kind === "before" ? "Before" : "After",
            note: "",
            width: 1,
            height: 1,
            isPrimaryDisplay: true,
            original: {
              extension: ".png",
              contentType: "image/png",
              sha256: String(index + 1).repeat(64),
              size: 1,
            },
            thumbnail: {
              extension: ".png",
              contentType: "image/png",
              sha256: String(index + 3).repeat(64),
              size: 1,
            },
          })),
        },
      ],
    };

    await expect(startGroupUpload(invalidInput)).rejects.toThrow();
    expect(helperMocks.ensureCaseAndGroup).not.toHaveBeenCalled();
  });

  it("cancels expired active jobs before looking for a resumable upload", async () => {
    helperMocks.ensureCaseAndGroup.mockResolvedValue({
      caseRow: { id: "case-1" },
      groupRow: {
        id: "group-1",
        isPublic: false,
        publicSlug: null,
        storageRoot: "/groups/group-1",
        lastUploadInputHash: null,
        _count: { frames: 0 },
      },
    });
    helperMocks.findActiveUploadJobByGroup.mockResolvedValue({
      id: "job-1",
      inputHash: expect.any(String),
      expectedFrameCount: 1,
      committedFrameCount: 0,
      frameJobs: [{ frameOrder: 0, status: "pending" }],
    });
    helperMocks.summarizeUploadJob.mockReturnValue({
      groupUploadJobId: "job-1",
    });

    const result = await startGroupUpload({
      case: {
        slug: "2026",
        title: "2026",
        summary: "",
        tags: [],
        coverAssetLabel: null,
      },
      group: {
        slug: "test-group",
        title: "Test Group",
        description: "",
        order: 0,
        defaultMode: "before-after",
        tags: [],
      },
      frames: [
        {
          order: 0,
          title: "Frame 1",
          caption: "",
          assets: [
            {
              slot: "before",
              kind: "before",
              label: "Before",
              note: "",
              width: 100,
              height: 100,
              isPrimaryDisplay: true,
              original: {
                extension: ".png",
                contentType: "image/png",
                sha256: "a".repeat(64),
                size: 100,
              },
              thumbnail: {
                extension: ".png",
                contentType: "image/png",
                sha256: "b".repeat(64),
                size: 10,
              },
            },
            {
              slot: "after",
              kind: "after",
              label: "After",
              note: "",
              width: 100,
              height: 100,
              isPrimaryDisplay: true,
              original: {
                extension: ".png",
                contentType: "image/png",
                sha256: "c".repeat(64),
                size: 100,
              },
              thumbnail: {
                extension: ".png",
                contentType: "image/png",
                sha256: "d".repeat(64),
                size: 10,
              },
            },
          ],
        },
      ],
    });

    expect(helperMocks.cancelExpiredActiveUploadJobs).toHaveBeenCalledWith("group-1");
    expect(helperMocks.cancelExpiredActiveUploadJobs.mock.invocationCallOrder[0]).toBeLessThan(
      helperMocks.findActiveUploadJobByGroup.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({ groupUploadJobId: "job-1" });
  });

  it("prepares one frame by loading only the targeted frame job", async () => {
    helperMocks.requireActiveFrameUploadJob.mockResolvedValue({
      id: "frame-job-1",
      frameOrder: 0,
      frameSnapshotJson: JSON.stringify({
        order: 0,
        title: "Frame 1",
        caption: "",
        assets: [],
      }),
      preparedAssetsJson: "",
      pendingPrefix: null,
      status: "pending",
      groupUploadJob: {
        id: "job-1",
        snapshotJson: "{}",
        inputHash: "hash-1",
        expectedFrameCount: 1,
        committedFrameCount: 0,
        status: "active",
        expiresAt: null,
        case: { id: "case-1", slug: "2026" },
        group: { id: "group-1", slug: "test-group", storageRoot: "/groups/group-1" },
      },
    });
    helperMocks.buildFramePendingPrefix.mockReturnValue("/groups/group-1/1/revision-1");
    helperMocks.buildPreparedUploadAssets.mockReturnValue([{ slot: "before" }]);
    helperMocks.buildPresignedFiles.mockResolvedValue([
      {
        slot: "before",
        variant: "original",
        logicalPath: "/groups/group-1/1/revision-1/o1.png",
        uploadUrl: "https://r2.example.com/o1",
        expiresInSeconds: 900,
        contentType: "image/png",
      },
    ]);

    const result = await prepareGroupUploadFrame({
      groupUploadJobId: "job-1",
      frameOrder: 0,
    });

    expect(helperMocks.requireActiveFrameUploadJob).toHaveBeenCalledWith("job-1", 0);
    expect(frameUploadJobUpdate).toHaveBeenCalledWith({
      where: { id: "frame-job-1" },
      data: {
        pendingPrefix: "/groups/group-1/1/revision-1",
        preparedAssetsJson: JSON.stringify([{ slot: "before" }]),
        status: "prepared",
      },
    });
    expect(result).toEqual({
      groupUploadJobId: "job-1",
      frameOrder: 0,
      pendingPrefix: "/groups/group-1/1/revision-1",
      files: [
        {
          slot: "before",
          variant: "original",
          logicalPath: "/groups/group-1/1/revision-1/o1.png",
          uploadUrl: "https://r2.example.com/o1",
          expiresInSeconds: 900,
          contentType: "image/png",
        },
      ],
    });
  });

  it("reuses a prepared revision when refreshing URLs for the same frame", async () => {
    helperMocks.requireActiveFrameUploadJob.mockResolvedValue({
      id: "frame-job-1",
      frameOrder: 0,
      frameSnapshotJson: JSON.stringify({
        order: 0,
        title: "Frame 1",
        caption: "",
        assets: [],
      }),
      preparedAssetsJson: JSON.stringify([{ slot: "before" }]),
      pendingPrefix: "/groups/group-1/1/revision-1",
      status: "prepared",
      groupUploadJob: {
        id: "job-1",
        snapshotJson: "{}",
        inputHash: "hash-1",
        expectedFrameCount: 1,
        committedFrameCount: 0,
        status: "active",
        expiresAt: null,
        case: { id: "case-1", slug: "2026" },
        group: { id: "group-1", slug: "test-group", storageRoot: "/groups/group-1" },
      },
    });
    helperMocks.buildPresignedFiles.mockResolvedValue([]);

    const result = await prepareGroupUploadFrame({
      groupUploadJobId: "job-1",
      frameOrder: 0,
    });

    expect(helperMocks.buildFramePendingPrefix).not.toHaveBeenCalled();
    expect(helperMocks.buildPreparedUploadAssets).not.toHaveBeenCalled();
    expect(frameUploadJobUpdate).not.toHaveBeenCalled();
    expect(deleteInternalAssetPrefix).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      pendingPrefix: "/groups/group-1/1/revision-1",
      files: [],
    });
  });

  it("rejects an attempt to replace an already prepared frame descriptor", async () => {
    const { frameJob, generatedFrame } = streamPrepareFixture();
    helperMocks.requireActiveFrameUploadJob.mockResolvedValue({
      ...frameJob,
      frameSnapshotJson: JSON.stringify(generatedFrame),
      preparedAssetsJson: JSON.stringify([]),
      pendingPrefix: "/groups/group-1/1/revision-1",
      status: "prepared",
    });
    const changedFrame = {
      ...generatedFrame,
      assets: generatedFrame.assets.map((asset) =>
        asset.slot === "slot-003"
          ? { ...asset, original: { ...asset.original, sha256: "e".repeat(64) } }
          : asset,
      ),
    };

    await expect(
      prepareGroupUploadFrame({
        groupUploadJobId: "job-1",
        frameOrder: 0,
        frame: changedFrame,
      }),
    ).rejects.toThrow("Frame is already prepared with a different descriptor.");

    expect(helperMocks.buildPresignedFiles).not.toHaveBeenCalled();
    expect(frameUploadJobUpdate).not.toHaveBeenCalled();
  });

  it("validates stream retries against the immutable source snapshot", async () => {
    const { frameJob, generatedFrame } = streamPrepareFixture();
    helperMocks.requireActiveFrameUploadJob.mockResolvedValue(frameJob);
    helperMocks.buildFramePendingPrefix.mockReturnValue("/groups/group-1/1/revision-1");
    helperMocks.buildPreparedUploadAssets.mockReturnValue([]);
    helperMocks.buildPresignedFiles.mockResolvedValue([]);

    await prepareGroupUploadFrame({
      groupUploadJobId: "job-1",
      frameOrder: 0,
      frame: generatedFrame,
    });

    expect(frameUploadJobUpdate).toHaveBeenCalledWith({
      where: { id: "frame-job-1" },
      data: expect.objectContaining({
        frameSnapshotJson: JSON.stringify(generatedFrame),
        status: "prepared",
      }),
    });
  });

  it("rejects a generated heatmap whose after slot is absent from the source snapshot", async () => {
    const { frameJob, generatedFrame } = streamPrepareFixture("slot-999");
    helperMocks.requireActiveFrameUploadJob.mockResolvedValue({
      ...frameJob,
      pendingPrefix: "/groups/group-1/1/previous-revision",
    });
    helperMocks.buildFramePendingPrefix.mockReturnValue("/groups/group-1/1/revision-1");
    helperMocks.buildPreparedUploadAssets.mockReturnValue([]);
    helperMocks.buildPresignedFiles.mockResolvedValue([]);

    await expect(
      prepareGroupUploadFrame({
        groupUploadJobId: "job-1",
        frameOrder: 0,
        frame: generatedFrame,
      }),
    ).rejects.toThrow("Generated heatmap no longer matches the validated source manifest.");

    expect(frameUploadJobUpdate).not.toHaveBeenCalled();
    expect(deleteInternalAssetPrefix).not.toHaveBeenCalled();
  });

  it("commits one frame by loading only the targeted frame job", async () => {
    helperMocks.requireActiveFrameUploadJob.mockResolvedValue({
      id: "frame-job-1",
      frameOrder: 0,
      frameSnapshotJson: JSON.stringify({
        order: 0,
        title: "Frame 1",
        caption: "",
        assets: [],
      }),
      preparedAssetsJson: JSON.stringify([]),
      pendingPrefix: "/groups/group-1/1/revision-1",
      status: "prepared",
      groupUploadJob: {
        id: "job-1",
        inputHash: "hash-1",
        expectedFrameCount: 1,
        committedFrameCount: 0,
        status: "active",
        expiresAt: null,
        case: { id: "case-1", slug: "2026" },
        group: { id: "group-1", slug: "test-group", storageRoot: "/groups/group-1" },
      },
    });
    frameFindMany.mockResolvedValue([{ id: "frame-0", storagePrefix: "/groups/group-1/1/old" }]);
    frameDeleteMany.mockReturnValue("deleted-frames");
    frameCreate.mockReturnValue("created-frame");
    caseUpdate.mockReturnValue("updated-case");
    frameUploadJobUpdateMany.mockResolvedValue({ count: 1 });
    groupUploadJobUpdate.mockReturnValue("updated-group-job");

    const result = await commitGroupUploadFrame({
      groupUploadJobId: "job-1",
      frameOrder: 0,
    });

    expect(helperMocks.requireActiveFrameUploadJob).toHaveBeenCalledWith("job-1", 0);
    expect(frameFindMany).toHaveBeenCalledWith({
      where: {
        groupId: "group-1",
        order: 0,
      },
      select: {
        id: true,
        storagePrefix: true,
      },
    });
    expect(helperMocks.deleteReplacedFramePrefixes).toHaveBeenCalledWith(
      [{ id: "frame-0", storagePrefix: "/groups/group-1/1/old" }],
      "/groups/group-1/1/revision-1",
    );
    expect(frameUploadJobUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "frame-job-1",
        status: "prepared",
        groupUploadJob: { status: "active" },
      },
      data: {
        status: "committed",
        committedAt: expect.any(Date),
      },
    });
    expect(result).toEqual({
      groupUploadJobId: "job-1",
      frameOrder: 0,
      status: "committed",
    });
  });

  it("treats a repeated committed-frame request as successful", async () => {
    helperMocks.requireActiveFrameUploadJob.mockResolvedValue({
      id: "frame-job-1",
      frameOrder: 0,
      frameSnapshotJson: JSON.stringify({ order: 0, title: "Frame 1", caption: "", assets: [] }),
      preparedAssetsJson: JSON.stringify([]),
      pendingPrefix: "/groups/group-1/1/revision-1",
      status: "committed",
      groupUploadJob: {
        id: "job-1",
        inputHash: "hash-1",
        expectedFrameCount: 1,
        committedFrameCount: 1,
        status: "active",
        expiresAt: null,
        case: { id: "case-1", slug: "2026" },
        group: { id: "group-1", slug: "test-group", storageRoot: "/groups/group-1" },
      },
    });

    await expect(
      commitGroupUploadFrame({ groupUploadJobId: "job-1", frameOrder: 0 }),
    ).resolves.toEqual({ groupUploadJobId: "job-1", frameOrder: 0, status: "committed" });

    expect(frameFindMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("does not replace rows or increment the count when another commit already claimed the frame", async () => {
    const preparedFrameJob = {
      id: "frame-job-1",
      frameOrder: 0,
      frameSnapshotJson: JSON.stringify({
        order: 0,
        title: "Frame 1",
        caption: "",
        assets: [],
      }),
      preparedAssetsJson: JSON.stringify([]),
      pendingPrefix: "/groups/group-1/1/revision-1",
      status: "prepared",
      groupUploadJob: {
        id: "job-1",
        inputHash: "hash-1",
        expectedFrameCount: 1,
        committedFrameCount: 0,
        status: "active",
        expiresAt: null,
        case: { id: "case-1", slug: "2026" },
        group: { id: "group-1", slug: "test-group", storageRoot: "/groups/group-1" },
      },
    };
    helperMocks.requireActiveFrameUploadJob
      .mockResolvedValueOnce(preparedFrameJob)
      .mockResolvedValueOnce({
        ...preparedFrameJob,
        status: "committed",
        groupUploadJob: {
          ...preparedFrameJob.groupUploadJob,
          committedFrameCount: 1,
        },
      });
    frameFindMany.mockResolvedValue([{ id: "frame-0", storagePrefix: "/groups/group-1/1/old" }]);
    frameUploadJobUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      commitGroupUploadFrame({ groupUploadJobId: "job-1", frameOrder: 0 }),
    ).resolves.toEqual({ groupUploadJobId: "job-1", frameOrder: 0, status: "committed" });

    expect(frameDeleteMany).not.toHaveBeenCalled();
    expect(frameCreate).not.toHaveBeenCalled();
    expect(groupUploadJobUpdate).not.toHaveBeenCalled();
    expect(helperMocks.deleteReplacedFramePrefixes).not.toHaveBeenCalled();
  });

  it("adds job and frame context to a failed commit storage validation", async () => {
    helperMocks.requireActiveFrameUploadJob.mockResolvedValue({
      id: "frame-job-1",
      frameOrder: 2,
      frameSnapshotJson: JSON.stringify({ order: 2, title: "Frame 3", caption: "", assets: [] }),
      preparedAssetsJson: JSON.stringify([]),
      pendingPrefix: "/groups/group-1/3/revision-1",
      status: "prepared",
      groupUploadJob: {
        id: "job-1",
        inputHash: "hash-1",
        expectedFrameCount: 3,
        committedFrameCount: 0,
        status: "active",
        expiresAt: null,
        case: { id: "case-1", slug: "2026" },
        group: { id: "group-1", slug: "test-group", storageRoot: "/groups/group-1" },
      },
    });
    helperMocks.assertPreparedAssetsUploaded.mockRejectedValue(
      new StorageValidationError({
        logicalPath: "/groups/group-1/3/revision-1/o1.png",
        code: "SignatureDoesNotMatch",
        requestId: "request-1",
        upstreamStatus: 403,
      }),
    );

    await expect(
      commitGroupUploadFrame({ groupUploadJobId: "job-1", frameOrder: 2 }),
    ).rejects.toMatchObject({
      diagnostic: {
        groupUploadJobId: "job-1",
        frameOrder: 2,
        stage: "commit",
        code: "SignatureDoesNotMatch",
      },
    });

    expect(frameFindMany).not.toHaveBeenCalled();
  });

  it("rejects complete when uncommitted frame rows still exist", async () => {
    helperMocks.requireActiveUploadJob.mockResolvedValue({
      id: "job-1",
      inputHash: "hash-1",
      expectedFrameCount: 2,
      committedFrameCount: 1,
      status: "active",
      expiresAt: null,
      case: { id: "case-1", slug: "2026" },
      group: { id: "group-1", slug: "test-group", storageRoot: "/groups/group-1" },
    });
    helperMocks.countUncommittedFrameJobs.mockResolvedValue(1);

    await expect(
      completeGroupUpload({
        groupUploadJobId: "job-1",
      }),
    ).rejects.toThrow("Not every frame in the upload job has been committed.");

    expect(helperMocks.markUploadJobCompleted).not.toHaveBeenCalled();
  });

  it("returns the completed status declared by the upload API", async () => {
    const job = {
      id: "job-1",
      inputHash: "hash-1",
      expectedFrameCount: 1,
      committedFrameCount: 1,
      status: "active",
      expiresAt: null,
      case: { id: "case-1", slug: "2026" },
      group: { id: "group-1", slug: "test-group", storageRoot: "/groups/group-1" },
    };
    helperMocks.requireActiveUploadJob.mockResolvedValue(job);
    helperMocks.countUncommittedFrameJobs.mockResolvedValue(0);

    await expect(completeGroupUpload({ groupUploadJobId: "job-1" })).resolves.toEqual({
      groupUploadJobId: "job-1",
      caseSlug: "2026",
      groupSlug: "test-group",
      status: "completed",
      committedFrameCount: 1,
    });

    expect(helperMocks.markUploadJobCompleted).toHaveBeenCalledWith(job);
  });

  it("cancels an active upload job and removes pending prefixes", async () => {
    helperMocks.requireActiveUploadJob.mockResolvedValue({
      id: "job-1",
      inputHash: "hash-1",
      expectedFrameCount: 2,
      committedFrameCount: 1,
      status: "active",
      expiresAt: null,
      case: { id: "case-1", slug: "2026" },
      group: { id: "group-1", slug: "test-group", storageRoot: "/groups/group-1" },
    });
    frameUploadJobFindMany.mockResolvedValue([
      { pendingPrefix: "/groups/group-1/1/pending" },
      { pendingPrefix: null },
    ]);
    frameUploadJobUpdateMany.mockReturnValue("cancelled-frames");
    groupUploadJobUpdate.mockReturnValue("cancelled-job");
    transaction.mockResolvedValue(undefined);

    const result = await cancelGroupUpload({
      groupUploadJobId: "job-1",
    });

    expect(helperMocks.requireActiveUploadJob).toHaveBeenCalledWith("job-1");
    expect(frameUploadJobFindMany).toHaveBeenCalledWith({
      where: {
        groupUploadJobId: "job-1",
        status: {
          not: "committed",
        },
      },
      select: {
        pendingPrefix: true,
      },
    });
    expect(frameUploadJobUpdateMany).toHaveBeenCalledWith({
      where: {
        groupUploadJobId: "job-1",
        status: {
          not: "committed",
        },
      },
      data: {
        status: "cancelled",
      },
    });
    expect(groupUploadJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "cancelled",
      },
    });
    expect(deleteInternalAssetPrefix).toHaveBeenCalledWith("/groups/group-1/1/pending");
    expect(result).toEqual({
      groupUploadJobId: "job-1",
      status: "cancelled",
      deletedPendingPrefixCount: 1,
    });
  });
});
