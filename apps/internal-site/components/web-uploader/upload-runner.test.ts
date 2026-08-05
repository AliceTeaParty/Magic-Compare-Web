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

function runner(
  frames: GeneratedUploadFrame[],
  options: {
    uploadConcurrency?: number;
    fileUploadConcurrency?: number;
    globalFileUploadConcurrency?: number;
  } = {},
) {
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
    ...options,
  });
}

async function drainTimers() {
  await vi.runOnlyPendingTimersAsync();
}

async function waitForMicrotasks(predicate: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error("Timed out waiting for microtasks.");
}

describe("WebUploadRunner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiMocks.startGroupUpload.mockReset();
    apiMocks.prepareGroupUploadFrame.mockReset();
    apiMocks.commitGroupUploadFrame.mockReset();
    apiMocks.completeGroupUpload.mockReset();
    apiMocks.cancelGroupUpload.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
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

  it("streams one preflighted frame through generation, prepare, PUT, and commit", async () => {
    const generated = frame(0);
    const sourceFrame = {
      order: generated.order,
      title: generated.title,
      caption: generated.caption,
      assets: generated.assets.map(({ thumbnail: _thumbnail, ...asset }) => ({
        ...asset,
        original: {
          extension: asset.original.extension,
          contentType: asset.original.contentType,
          sha256: asset.original.sha256,
          size: asset.original.size,
        },
      })),
      generatedHeatmap: null,
    };
    const generateFrame = vi.fn().mockResolvedValue(generated);
    apiMocks.startGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-stream",
      inputHash: "hash-stream",
      expectedFrameCount: 1,
      committedFrameCount: 0,
      canComplete: false,
      frameStates: [{ frameOrder: 0, status: "pending" }],
    });
    apiMocks.prepareGroupUploadFrame.mockResolvedValue({
      groupUploadJobId: "job-stream",
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
    apiMocks.commitGroupUploadFrame.mockResolvedValue({
      groupUploadJobId: "job-stream",
      frameOrder: 0,
      status: "committed",
    });
    apiMocks.completeGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-stream",
      status: "completed",
      committedFrameCount: 1,
    });

    const uploadRunner = new WebUploadRunner({
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
      uploadConcurrency: 1,
      stream: { frames: [sourceFrame], generateFrame },
    });

    await uploadRunner.start();

    expect(apiMocks.startGroupUpload).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: "stream-v2", frames: [sourceFrame] }),
    );
    expect(generateFrame).toHaveBeenCalledOnce();
    expect(apiMocks.prepareGroupUploadFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        groupUploadJobId: "job-stream",
        frameOrder: 0,
        frame: expect.objectContaining({ order: 0 }),
      }),
    );
    expect(uploadRunner.getSnapshot()).toMatchObject({
      stage: "completed",
      completedFrames: 1,
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

  it("cancels a server job created after abandon wins the start-request race", async () => {
    const startResult = {
      groupUploadJobId: "job-delayed",
      inputHash: "hash-delayed",
      expectedFrameCount: 1,
      committedFrameCount: 0,
      canComplete: false,
      frameStates: [{ frameOrder: 0, status: "pending" as const }],
    };
    let resolveStart!: (value: typeof startResult) => void;
    apiMocks.startGroupUpload.mockReturnValue(
      new Promise<typeof startResult>((resolve) => {
        resolveStart = resolve;
      }),
    );
    apiMocks.cancelGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-delayed",
      status: "cancelled",
      deletedPendingPrefixCount: 0,
    });

    const uploadRunner = runner([frame(0)]);
    const run = uploadRunner.start();
    await Promise.resolve();
    const cancel = uploadRunner.cancel();

    expect(apiMocks.cancelGroupUpload).not.toHaveBeenCalled();
    resolveStart(startResult);
    await Promise.all([run, cancel]);

    expect(apiMocks.cancelGroupUpload).toHaveBeenCalledOnce();
    expect(apiMocks.cancelGroupUpload).toHaveBeenCalledWith({
      groupUploadJobId: "job-delayed",
    });
    expect(apiMocks.prepareGroupUploadFrame).not.toHaveBeenCalled();
  });

  it("uploads files inside one frame concurrently before serial commit", async () => {
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
        {
          slot: "slot-001",
          variant: "thumbnail",
          logicalPath: "/pending/t1.png",
          uploadUrl: "https://r2.example/t1",
          expiresInSeconds: 900,
          contentType: "image/png",
        },
        {
          slot: "slot-002",
          variant: "original",
          logicalPath: "/pending/o2.png",
          uploadUrl: "https://r2.example/o2",
          expiresInSeconds: 900,
          contentType: "image/png",
        },
        {
          slot: "slot-002",
          variant: "thumbnail",
          logicalPath: "/pending/t2.png",
          uploadUrl: "https://r2.example/t2",
          expiresInSeconds: 900,
          contentType: "image/png",
        },
      ],
    });
    apiMocks.commitGroupUploadFrame.mockResolvedValue({
      groupUploadJobId: "job-1",
      inputHash: "hash-1",
      expectedFrameCount: 1,
      committedFrameCount: 1,
      canComplete: true,
      frameStates: [{ frameOrder: 0, status: "committed" }],
    });
    apiMocks.completeGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-1",
      status: "completed",
      committedFrameCount: 1,
    });

    const pendingResponses: Array<(value: Response) => void> = [];
    vi.mocked(globalThis.fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          pendingResponses.push(resolve);
        }),
    );

    const uploadRunner = runner([frame(0)], { fileUploadConcurrency: 4 });
    const run = uploadRunner.start();
    await waitForMicrotasks(() => pendingResponses.length === 4);

    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    expect(apiMocks.commitGroupUploadFrame).not.toHaveBeenCalled();

    for (const resolve of pendingResponses) {
      resolve({ ok: true, status: 200 } as Response);
    }

    await run;
    await drainTimers();

    expect(apiMocks.commitGroupUploadFrame).toHaveBeenCalledWith({
      groupUploadJobId: "job-1",
      frameOrder: 0,
    });
  });

  it("caps PUT concurrency across simultaneously generated frames", async () => {
    const frames = [frame(0), frame(1), frame(2)];
    apiMocks.startGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-global-cap",
      inputHash: "hash-global-cap",
      expectedFrameCount: frames.length,
      committedFrameCount: 0,
      canComplete: false,
      frameStates: frames.map((item) => ({ frameOrder: item.order, status: "pending" })),
    });
    apiMocks.prepareGroupUploadFrame.mockImplementation(
      async ({ frameOrder }: { frameOrder: number }) => ({
        groupUploadJobId: "job-global-cap",
        frameOrder,
        files: [
          "slot-001:original",
          "slot-001:thumbnail",
          "slot-002:original",
          "slot-002:thumbnail",
        ].map((key) => {
          const [slot, variant] = key.split(":");
          return {
            slot,
            variant,
            logicalPath: `/pending/${frameOrder}/${key}.png`,
            uploadUrl: `https://r2.example/${frameOrder}/${key}`,
            expiresInSeconds: 900,
            contentType: "image/png",
          };
        }),
      }),
    );
    apiMocks.commitGroupUploadFrame.mockResolvedValue({ status: "committed" });
    apiMocks.completeGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-global-cap",
      status: "completed",
      committedFrameCount: frames.length,
    });

    let activePuts = 0;
    let maxActivePuts = 0;
    vi.mocked(globalThis.fetch).mockImplementation(async () => {
      activePuts += 1;
      maxActivePuts = Math.max(maxActivePuts, activePuts);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activePuts -= 1;
      return { ok: true, status: 200 } as Response;
    });

    const uploadRunner = runner(frames, {
      uploadConcurrency: 3,
      fileUploadConcurrency: 4,
      globalFileUploadConcurrency: 6,
    });
    const run = uploadRunner.start();
    await waitForMicrotasks(() => maxActivePuts === 6);
    await vi.runAllTimersAsync();
    await run;

    expect(maxActivePuts).toBe(6);
    expect(globalThis.fetch).toHaveBeenCalledTimes(12);
  });

  it("aborts sibling file PUTs in the same frame after one file fails", async () => {
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

    const pendingRejects: Array<(reason: Error) => void> = [];
    const observedSignals: AbortSignal[] = [];
    vi.mocked(globalThis.fetch).mockImplementation((_, init) => {
      if (init?.signal instanceof AbortSignal) {
        observedSignals.push(init.signal);
      }
      return new Promise<Response>((_resolve, reject) => {
        if (init?.signal instanceof AbortSignal) {
          init.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }
        pendingRejects.push(reject);
      });
    });

    const snapshots: UploadRunnerSnapshot[] = [];
    const uploadRunner = runner([frame(0)], { fileUploadConcurrency: 2 });
    uploadRunner.subscribe((snapshot) => snapshots.push(snapshot));
    const run = uploadRunner.start();
    await waitForMicrotasks(() => pendingRejects.length === 2);

    pendingRejects[0](new Error("network failed"));
    await run;
    await drainTimers();

    expect(observedSignals[1].aborted).toBe(true);
    expect(apiMocks.commitGroupUploadFrame).not.toHaveBeenCalled();
    expect(snapshots.at(-1)).toMatchObject({
      stage: "failed",
      failedCount: 1,
    });
  });
});
