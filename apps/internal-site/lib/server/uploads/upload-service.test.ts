import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitGroupUploadFrame,
  completeGroupUpload,
  prepareGroupUploadFrame,
  startGroupUpload,
} from "./upload-service";

const {
  groupUploadJobCreate,
  groupUploadJobUpdate,
  frameUploadJobUpdate,
  frameFindMany,
  frameDeleteMany,
  frameCreate,
  caseUpdate,
  transaction,
} = vi.hoisted(() => ({
  groupUploadJobCreate: vi.fn(),
  groupUploadJobUpdate: vi.fn(),
  frameUploadJobUpdate: vi.fn(),
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

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    groupUploadJob: {
      create: groupUploadJobCreate,
      update: groupUploadJobUpdate,
    },
    frameUploadJob: {
      update: frameUploadJobUpdate,
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

vi.mock("./upload-service-helpers", async () => {
  const actual = await vi.importActual<typeof import("./upload-service-helpers")>(
    "./upload-service-helpers",
  );

  return {
    ...actual,
    ...helperMocks,
  };
});

describe("upload-service", () => {
  beforeEach(() => {
    groupUploadJobCreate.mockReset();
    groupUploadJobUpdate.mockReset();
    frameUploadJobUpdate.mockReset();
    frameFindMany.mockReset();
    frameDeleteMany.mockReset();
    frameCreate.mockReset();
    caseUpdate.mockReset();
    transaction.mockReset();

    Object.values(helperMocks).forEach((mockFn) => mockFn.mockReset());
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
    expect(
      helperMocks.cancelExpiredActiveUploadJobs.mock.invocationCallOrder[0],
    ).toBeLessThan(helperMocks.findActiveUploadJobByGroup.mock.invocationCallOrder[0]);
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
    frameUploadJobUpdate.mockReturnValue("updated-frame-job");
    groupUploadJobUpdate.mockReturnValue("updated-group-job");
    transaction.mockResolvedValue(undefined);

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
    expect(result).toEqual({
      groupUploadJobId: "job-1",
      frameOrder: 0,
      status: "committed",
    });
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
});
