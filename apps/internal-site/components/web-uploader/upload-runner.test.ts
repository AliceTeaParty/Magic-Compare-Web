import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebUploadRunner } from "./upload-runner";
import type { GeneratedUploadFrame, UploadRunnerSnapshot } from "./web-upload-types";

const apiMocks = vi.hoisted(() => ({
  startGroupUpload: vi.fn(),
  prepareGroupUploadFrame: vi.fn(),
  commitGroupUploadFrame: vi.fn(),
  completeGroupUpload: vi.fn(),
  cancelGroupUpload: vi.fn(),
}));

vi.mock("./upload-api", () => ({
  startGroupUpload: apiMocks.startGroupUpload,
  prepareGroupUploadFrame: apiMocks.prepareGroupUploadFrame,
  commitGroupUploadFrame: apiMocks.commitGroupUploadFrame,
  completeGroupUpload: apiMocks.completeGroupUpload,
  cancelGroupUpload: apiMocks.cancelGroupUpload,
}));

const sha = (char: string) => char.repeat(64);

function uploadFile(char: string) {
  return {
    blob: new Blob([char], { type: "image/png" }),
    extension: ".png",
    contentType: "image/png",
    sha256: sha(char),
    size: 1,
  };
}

function frame(order: number): GeneratedUploadFrame {
  return {
    order,
    title: `Frame ${order + 1}`,
    caption: "",
    assets: [
      {
        slot: "slot-001",
        kind: "before",
        label: "Before",
        note: "",
        width: 10,
        height: 10,
        isPrimaryDisplay: true,
        original: uploadFile("a"),
        thumbnail: uploadFile("b"),
      },
      {
        slot: "slot-002",
        kind: "after",
        label: "After",
        note: "",
        width: 10,
        height: 10,
        isPrimaryDisplay: true,
        original: uploadFile("c"),
        thumbnail: uploadFile("d"),
      },
    ],
  };
}

function runner(frames: GeneratedUploadFrame[]) {
  return new WebUploadRunner({
    caseInput: {
      slug: "mono",
      title: "Mono",
      summary: "",
      tags: [],
      coverAssetLabel: null,
    },
    groupInput: {
      slug: "comparison",
      title: "Comparison",
      description: "",
      defaultMode: "before-after",
      order: 0,
      tags: [],
    },
    frames,
  });
}

async function drainTimers() {
  await vi.runOnlyPendingTimersAsync();
}

describe("WebUploadRunner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiMocks.startGroupUpload.mockReset();
    apiMocks.prepareGroupUploadFrame.mockReset();
    apiMocks.commitGroupUploadFrame.mockReset();
    apiMocks.completeGroupUpload.mockReset();
    apiMocks.cancelGroupUpload.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
  });

  it("skips committed frames returned by start and uploads pending frames", async () => {
    apiMocks.startGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-1",
      inputHash: "hash-1",
      expectedFrameCount: 2,
      committedFrameCount: 1,
      canComplete: false,
      frameStates: [
        { frameOrder: 0, status: "committed" },
        { frameOrder: 1, status: "pending" },
      ],
    });
    apiMocks.prepareGroupUploadFrame.mockResolvedValue({
      groupUploadJobId: "job-1",
      frameOrder: 1,
      files: [
        {
          slot: "slot-001",
          variant: "original",
          logicalPath: "/pending/o1.png",
          uploadUrl: "https://r2.example/o1",
          expiresInSeconds: 900,
          contentType: "image/png",
        },
        {
          slot: "slot-001",
          variant: "thumbnail",
          logicalPath: "/pending/t1.png",
          uploadUrl: "https://r2.example/t1",
          expiresInSeconds: 900,
          contentType: "image/png",
        },
      ],
    });
    apiMocks.commitGroupUploadFrame.mockResolvedValue({
      groupUploadJobId: "job-1",
      inputHash: "hash-1",
      expectedFrameCount: 2,
      committedFrameCount: 2,
      canComplete: true,
      frameStates: [
        { frameOrder: 0, status: "committed" },
        { frameOrder: 1, status: "committed" },
      ],
    });
    apiMocks.completeGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-1",
      status: "completed",
      committedFrameCount: 2,
    });

    const uploadRunner = runner([frame(0), frame(1)]);
    const snapshots: UploadRunnerSnapshot[] = [];
    uploadRunner.subscribe((snapshot) => snapshots.push(snapshot));

    const run = uploadRunner.start();
    await drainTimers();
    await run;
    await drainTimers();

    expect(apiMocks.prepareGroupUploadFrame).toHaveBeenCalledTimes(1);
    expect(apiMocks.prepareGroupUploadFrame).toHaveBeenCalledWith({
      groupUploadJobId: "job-1",
      frameOrder: 1,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(apiMocks.commitGroupUploadFrame).toHaveBeenCalledWith({
      groupUploadJobId: "job-1",
      frameOrder: 1,
    });
    expect(apiMocks.completeGroupUpload).toHaveBeenCalledWith({
      groupUploadJobId: "job-1",
    });
    expect(snapshots.at(-1)).toMatchObject({
      stage: "completed",
      completedFrames: 2,
      completedFiles: 8,
      result: {
        caseSlug: "mono",
        groupSlug: "comparison",
        committedFrameCount: 2,
      },
    });
  });

  it("cancels the active server job when abandoning an upload", async () => {
    apiMocks.startGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-1",
      inputHash: "hash-1",
      expectedFrameCount: 1,
      committedFrameCount: 0,
      canComplete: false,
      frameStates: [{ frameOrder: 0, status: "pending" }],
    });
    apiMocks.prepareGroupUploadFrame.mockResolvedValue({
      groupUploadJobId: "job-1",
      frameOrder: 0,
      files: [
        {
          slot: "slot-001",
          variant: "original",
          logicalPath: "/pending/o1.png",
          uploadUrl: "https://r2.example/o1",
          expiresInSeconds: 900,
          contentType: "image/png",
        },
      ],
    });
    apiMocks.cancelGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-1",
      status: "cancelled",
      deletedPendingPrefixCount: 1,
    });
    vi.mocked(globalThis.fetch).mockImplementation((_, init) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        if (signal instanceof AbortSignal) {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }
      });
    });

    const uploadRunner = runner([frame(0)]);
    const run = uploadRunner.start();
    await Promise.resolve();
    await Promise.resolve();
    await uploadRunner.cancel();

    expect(apiMocks.cancelGroupUpload).toHaveBeenCalledWith({
      groupUploadJobId: "job-1",
    });

    await run;
  });
});
