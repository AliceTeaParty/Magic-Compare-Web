import type {
  GroupUploadStartInput,
  UploadAssetDescriptor,
  UploadFrameDescriptor,
  UploadStreamFrameDescriptor,
} from "@/lib/server/uploads/contracts";
import {
  cancelGroupUpload,
  commitGroupUploadFrame,
  completeGroupUpload,
  prepareGroupUploadFrame,
  startGroupUpload,
  type PreparedUploadFile,
  type UploadFrameState,
} from "./upload-api";
import type {
  GeneratedUploadAsset,
  GeneratedUploadFile,
  GeneratedUploadFrame,
  UploadRunnerFrameSnapshot,
  UploadRunnerSnapshot,
  WebUploadGroupMetadata,
  WebUploadStage,
} from "./web-upload-types";

const SNAPSHOT_THROTTLE_MS = 140;
const DEFAULT_UPLOAD_CONCURRENCY = 2;
const DEFAULT_FILE_UPLOAD_CONCURRENCY = 3;
const DEFAULT_GLOBAL_FILE_UPLOAD_CONCURRENCY = 6;

type UploadFileVariant = "original" | "thumbnail";
type RunnerListener = (snapshot: UploadRunnerSnapshot) => void;

interface CommonUploadRunnerOptions {
  caseInput: GroupUploadStartInput["case"];
  groupInput: WebUploadGroupMetadata;
  uploadConcurrency?: number;
  fileUploadConcurrency?: number;
  globalFileUploadConcurrency?: number;
}

interface LegacyUploadRunnerOptions extends CommonUploadRunnerOptions {
  frames: GeneratedUploadFrame[];
  stream?: never;
}

interface StreamUploadRunnerOptions extends CommonUploadRunnerOptions {
  frames?: never;
  stream: {
    frames: UploadStreamFrameDescriptor[];
    generateFrame: (frameOrder: number, signal: AbortSignal) => Promise<GeneratedUploadFrame>;
  };
}

type UploadRunnerOptions = LegacyUploadRunnerOptions | StreamUploadRunnerOptions;

interface UploadFileSource {
  blob: Blob;
  contentType: string;
  label: string;
}

interface RunnerFrameState {
  order: number;
  title: string;
  status: UploadRunnerFrameSnapshot["status"];
  progress: number;
  uploadedFiles: number;
  totalFiles: number;
  error?: string;
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, value));
}

function descriptorFromFile(file: GeneratedUploadFile) {
  return {
    extension: file.extension,
    contentType: file.contentType,
    sha256: file.sha256,
    size: file.size,
  };
}

function assetDescriptor(asset: GeneratedUploadAsset): UploadAssetDescriptor {
  return {
    slot: asset.slot,
    kind: asset.kind,
    label: asset.label,
    note: asset.note,
    width: asset.width,
    height: asset.height,
    isPrimaryDisplay: asset.isPrimaryDisplay,
    original: descriptorFromFile(asset.original),
    thumbnail: descriptorFromFile(asset.thumbnail),
  };
}

function frameDescriptor(frame: GeneratedUploadFrame): UploadFrameDescriptor {
  return {
    order: frame.order,
    title: frame.title,
    caption: frame.caption,
    assets: frame.assets.map(assetDescriptor),
  };
}

function uploadFileKey(frameOrder: number, slot: string, variant: UploadFileVariant) {
  return `${frameOrder}:${slot}:${variant}`;
}

/**
 * Builds the server upload payload and local Blob lookup together so the descriptor order and PUT
 * body map cannot drift while React still avoids holding large File/Blob objects in state.
 */
function buildLegacyUploadPlan(options: LegacyUploadRunnerOptions) {
  const filesByKey = new Map<string, UploadFileSource>();
  const frames = options.frames.map((frame) => {
    for (const asset of frame.assets) {
      for (const variant of ["original", "thumbnail"] as const) {
        const file = asset[variant];
        filesByKey.set(uploadFileKey(frame.order, asset.slot, variant), {
          blob: file.blob,
          contentType: file.contentType,
          label: `${frame.title} ${asset.label} ${variant}`,
        });
      }
    }

    return {
      order: frame.order,
      title: frame.title,
      caption: frame.caption,
      assets: frame.assets.map(assetDescriptor),
    };
  });

  return {
    payload: {
      case: options.caseInput,
      group: {
        slug: options.groupInput.slug,
        title: options.groupInput.title,
        description: options.groupInput.description,
        order: options.groupInput.order,
        defaultMode: options.groupInput.defaultMode,
        tags: options.groupInput.tags,
      },
      frames,
      forceRestart: false,
    } satisfies GroupUploadStartInput,
    filesByKey,
  };
}

function buildStreamUploadPlan(options: StreamUploadRunnerOptions) {
  return {
    payload: {
      protocol: "stream-v2" as const,
      case: options.caseInput,
      group: {
        slug: options.groupInput.slug,
        title: options.groupInput.title,
        description: options.groupInput.description,
        order: options.groupInput.order,
        defaultMode: options.groupInput.defaultMode,
        tags: options.groupInput.tags,
      },
      frames: options.stream.frames,
      forceRestart: false,
    } satisfies GroupUploadStartInput,
    filesByKey: new Map<string, UploadFileSource>(),
  };
}

/** Caps PUTs across all active frames; per-frame pools alone would multiply concurrency. */
class AsyncSemaphore {
  private active = 0;
  private readonly waiters: Array<{
    resolve: (release: () => void) => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
    abort?: () => void;
  }> = [];

  constructor(private readonly limit: number) {}

  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      return Promise.reject(new DOMException("Upload was paused.", "AbortError"));
    }
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve(this.releaseFactory());
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal } as (typeof this.waiters)[number];
      waiter.abort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new DOMException("Upload was paused.", "AbortError"));
      };
      signal?.addEventListener("abort", waiter.abort, { once: true });
      this.waiters.push(waiter);
    });
  }

  private releaseFactory() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const waiter = this.waiters.shift();
      if (waiter) {
        if (waiter.abort) waiter.signal?.removeEventListener("abort", waiter.abort);
        waiter.resolve(this.releaseFactory());
      } else {
        this.active -= 1;
      }
    };
  }
}

/**
 * Owns the browser upload state machine so the page only subscribes to throttled summaries while
 * File/Blob objects, AbortControllers, and transient progress remain outside React state.
 */
export class WebUploadRunner {
  private readonly payload: GroupUploadStartInput;
  private readonly filesByKey: Map<string, UploadFileSource>;
  private readonly uploadConcurrency: number;
  private readonly fileUploadConcurrency: number;
  private readonly fileUploadSemaphore: AsyncSemaphore;
  private readonly generatedFramesByOrder = new Map<number, GeneratedUploadFrame>();
  private readonly generateFrame: StreamUploadRunnerOptions["stream"]["generateFrame"] | null;
  private readonly listeners = new Set<RunnerListener>();
  private readonly abortControllers = new Set<AbortController>();
  private readonly generationControllers = new Set<AbortController>();
  private readonly frames = new Map<number, RunnerFrameState>();
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  private jobId: string | null = null;
  private inputHash: string | null = null;
  private pendingStartRequest: ReturnType<typeof startGroupUpload> | null = null;
  private serverCancellation: Promise<void> | null = null;
  private stage: WebUploadStage = "ready";
  private message = "准备上传。";
  private paused = false;
  private cancelled = false;
  private running = false;
  private commitQueue = Promise.resolve();
  private uploadedFiles = 0;
  private totalFiles = 0;
  private failedCount = 0;
  private retriedCount = 0;
  private committedCount = 0;
  private committedFrameOrders = new Set<number>();

  constructor(options: UploadRunnerOptions) {
    const plan =
      "stream" in options && options.stream
        ? buildStreamUploadPlan(options)
        : buildLegacyUploadPlan(options);
    this.payload = plan.payload;
    this.filesByKey = plan.filesByKey;
    this.uploadConcurrency = options.uploadConcurrency ?? DEFAULT_UPLOAD_CONCURRENCY;
    this.fileUploadConcurrency = options.fileUploadConcurrency ?? DEFAULT_FILE_UPLOAD_CONCURRENCY;
    this.fileUploadSemaphore = new AsyncSemaphore(
      options.globalFileUploadConcurrency ?? DEFAULT_GLOBAL_FILE_UPLOAD_CONCURRENCY,
    );
    this.generateFrame =
      "stream" in options && options.stream ? options.stream.generateFrame : null;

    const frames = "stream" in options && options.stream ? options.stream.frames : options.frames;
    if (!("stream" in options) || !options.stream) {
      for (const frame of options.frames) this.generatedFramesByOrder.set(frame.order, frame);
    }

    for (const frame of frames) {
      const totalFiles =
        (frame.assets.length + ("generatedHeatmap" in frame && frame.generatedHeatmap ? 1 : 0)) * 2;
      this.frames.set(frame.order, {
        order: frame.order,
        title: frame.title,
        status: "pending",
        progress: 0,
        uploadedFiles: 0,
        totalFiles,
      });
      this.totalFiles += totalFiles;
    }
  }

  getSnapshot(): UploadRunnerSnapshot {
    return {
      stage: this.stage,
      jobId: this.jobId,
      inputHash: this.inputHash,
      message: this.message,
      completedFiles: this.uploadedFiles,
      totalFiles: this.totalFiles,
      completedFrames: this.committedCount,
      totalFrames: this.frames.size,
      failedCount: this.failedCount,
      retriedCount: this.retriedCount,
      frames: [...this.frames.values()].map((frame) => ({
        frameOrder: frame.order,
        title: frame.title,
        status: frame.status,
        completedFiles: frame.uploadedFiles,
        totalFiles: frame.totalFiles,
        error: frame.error ?? null,
      })),
      result:
        this.stage === "completed"
          ? {
              caseSlug: this.payload.case.slug,
              groupSlug: this.payload.group.slug,
              committedFrameCount: this.committedCount,
            }
          : null,
    };
  }

  subscribe(listener: RunnerListener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private abortBrowserRequests() {
    for (const controller of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();
    for (const controller of this.generationControllers) {
      controller.abort();
    }
    this.generationControllers.clear();
  }

  private cancelServerJob() {
    if (!this.jobId) {
      return Promise.resolve();
    }
    this.serverCancellation ??= cancelGroupUpload({ groupUploadJobId: this.jobId }).then(
      () => undefined,
    );
    return this.serverCancellation;
  }

  /**
   * Pauses only browser-side work. The server job remains resumable, and a later start can safely
   * re-prepare non-committed frames using the same payload hash.
   */
  pause() {
    if (this.stage !== "uploading") {
      return;
    }

    this.paused = true;
    this.stage = "paused";
    this.message = "已暂停，可继续上传。";
    this.abortBrowserRequests();
    this.emitSoon();
  }

  /**
   * Abandon is deliberately stronger than pause: browser PUTs stop immediately and any server-side
   * prepared prefixes are cancelled so a later upload starts from an honest empty state.
   */
  async cancel() {
    this.cancelled = true;
    this.paused = true;
    this.stage = "paused";
    this.message = "正在放弃上传。";
    this.abortBrowserRequests();
    this.emitSoon();

    if (!this.jobId && this.pendingStartRequest) {
      try {
        await this.pendingStartRequest;
      } catch {
        // A rejected start did not return a cancellable job identity.
      }
    }
    await this.cancelServerJob();
  }

  dispose() {
    this.pause();
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    this.listeners.clear();
  }

  /**
   * Starts or resumes the same upload payload. The API decides whether existing committed frames
   * can be skipped, so the runner does not need its own persistent status endpoint.
   */
  async start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.paused = false;
    const wasRestarting = this.stage === "failed" || this.stage === "paused";
    this.stage = "uploading";
    this.message = "正在初始化上传任务。";
    this.failedCount = 0;
    if (wasRestarting) {
      this.retriedCount += 1;
    }
    this.emitSoon();

    try {
      this.pendingStartRequest = startGroupUpload(this.payload);
      const startResult = await this.pendingStartRequest;
      this.jobId = startResult.groupUploadJobId;
      this.inputHash = startResult.inputHash;
      // Abandon can happen while the start request is in flight. Once the server returns the new
      // identity, finish that deferred cancellation before any frame generation or PUT can begin.
      if (this.cancelled) {
        await this.cancelServerJob();
        return;
      }
      this.applyServerFrameStates(startResult.frameStates);

      const pendingFrames = [...this.frames.values()]
        .filter((frame) => frame.status !== "committed")
        .sort((left, right) => left.order - right.order);

      await this.runFramePool(pendingFrames);

      if (this.cancelled) {
        return;
      }

      if (this.paused) {
        this.stage = "paused";
        this.message = "已暂停，可继续上传。";
        return;
      }

      if (this.failedCount > 0) {
        this.stage = "failed";
        this.message = "部分 frame 上传失败，可重试失败项。";
        return;
      }

      await completeGroupUpload({ groupUploadJobId: this.requireJobId() });
      if (this.cancelled) {
        return;
      }
      this.stage = "completed";
      this.message = "上传完成。";
      this.emitSoon();
    } catch (error) {
      if (this.cancelled) {
        return;
      }
      if (this.paused) {
        this.stage = "paused";
        this.message = "已暂停，可继续上传。";
      } else {
        this.stage = "failed";
        this.message = error instanceof Error ? error.message : "上传失败。";
      }
      this.emitSoon();
    } finally {
      this.pendingStartRequest = null;
      this.running = false;
    }
  }

  private requireJobId() {
    if (!this.jobId) {
      throw new Error("上传任务尚未初始化。");
    }
    return this.jobId;
  }

  private emitSoon() {
    if (this.snapshotTimer) {
      return;
    }

    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      const snapshot = this.getSnapshot();
      for (const listener of this.listeners) {
        listener(snapshot);
      }
    }, SNAPSHOT_THROTTLE_MS);
  }

  private applyServerFrameStates(states: UploadFrameState[]) {
    this.committedFrameOrders = new Set(
      states.filter((frame) => frame.status === "committed").map((frame) => frame.frameOrder),
    );
    this.committedCount = this.committedFrameOrders.size;
    this.uploadedFiles = 0;

    for (const frame of this.frames.values()) {
      const serverState = states.find((state) => state.frameOrder === frame.order);
      if (serverState?.status === "committed") {
        frame.status = "committed";
        frame.progress = 1;
        frame.uploadedFiles = frame.totalFiles;
        frame.error = undefined;
        this.uploadedFiles += frame.totalFiles;
      } else {
        frame.status = "pending";
        frame.progress = 0;
        frame.uploadedFiles = 0;
        frame.error = undefined;
      }
    }

    this.emitSoon();
  }

  private async runFramePool(frames: RunnerFrameState[]) {
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(this.uploadConcurrency, frames.length));
    const workers = Array.from({ length: workerCount }, async () => {
      while (!this.paused) {
        const frame = frames[cursor];
        cursor += 1;
        if (!frame) {
          return;
        }

        await this.processFrame(frame);
      }
    });

    await Promise.all(workers);
  }

  private async processFrame(frame: RunnerFrameState) {
    let generatedFrame: GeneratedUploadFrame | null = null;
    frame.status = this.generateFrame ? "generating" : "preparing";
    frame.error = undefined;
    this.message = this.generateFrame ? `正在生成 ${frame.title}。` : `正在准备 ${frame.title}。`;
    this.emitSoon();

    try {
      generatedFrame = await this.resolveGeneratedFrame(frame);
      this.registerFrameFiles(generatedFrame);
      frame.status = "preparing";
      this.message = `正在准备 ${frame.title}。`;
      this.emitSoon();
      const prepared = await prepareGroupUploadFrame({
        groupUploadJobId: this.requireJobId(),
        frameOrder: frame.order,
        ...(this.generateFrame ? { frame: frameDescriptor(generatedFrame) } : {}),
      });

      frame.status = "uploading";
      this.message = `正在上传 ${frame.title}。`;
      this.emitSoon();

      await this.uploadPreparedFiles(frame, prepared.files);

      frame.status = "committing";
      this.message = `正在提交 ${frame.title}。`;
      this.emitSoon();
      await this.commitFrame(frame);
    } catch (error) {
      if (this.paused) {
        return;
      }
      frame.status = "failed";
      frame.error = error instanceof Error ? error.message : "Frame 上传失败。";
      frame.progress = clampProgress(frame.uploadedFiles / frame.totalFiles);
      this.failedCount += 1;
      this.emitSoon();
    } finally {
      if (this.generateFrame && generatedFrame) {
        this.releaseFrameFiles(generatedFrame);
      }
    }
  }

  /** Generates only pending frames and keeps their Blobs reachable until that frame commits. */
  private async resolveGeneratedFrame(frame: RunnerFrameState) {
    const existing = this.generatedFramesByOrder.get(frame.order);
    if (existing) return existing;
    if (!this.generateFrame) {
      throw new Error(`找不到 ${frame.title} 的生成计划。`);
    }

    const controller = new AbortController();
    this.generationControllers.add(controller);
    try {
      const generated = await this.generateFrame(frame.order, controller.signal);
      if (generated.order !== frame.order) {
        throw new Error(`${frame.title} 的生成结果顺序不一致。`);
      }
      return generated;
    } finally {
      this.generationControllers.delete(controller);
    }
  }

  private registerFrameFiles(frame: GeneratedUploadFrame) {
    for (const asset of frame.assets) {
      for (const variant of ["original", "thumbnail"] as const) {
        const file = asset[variant];
        this.filesByKey.set(uploadFileKey(frame.order, asset.slot, variant), {
          blob: file.blob,
          contentType: file.contentType,
          label: `${frame.title} ${asset.label} ${variant}`,
        });
      }
    }
  }

  private releaseFrameFiles(frame: GeneratedUploadFrame) {
    for (const asset of frame.assets) {
      for (const variant of ["original", "thumbnail"] as const) {
        this.filesByKey.delete(uploadFileKey(frame.order, asset.slot, variant));
      }
    }
  }

  private async uploadPreparedFile(
    frame: RunnerFrameState,
    preparedFile: PreparedUploadFile,
    batchControllers?: Set<AbortController>,
  ) {
    const source = this.filesByKey.get(
      uploadFileKey(frame.order, preparedFile.slot, preparedFile.variant),
    );
    if (!source) {
      throw new Error(`找不到 ${frame.title} 的本地文件。`);
    }

    const controller = new AbortController();
    this.abortControllers.add(controller);
    batchControllers?.add(controller);
    let release: (() => void) | null = null;
    try {
      release = await this.fileUploadSemaphore.acquire(controller.signal);
      const response = await fetch(preparedFile.uploadUrl, {
        method: "PUT",
        headers: {
          "content-type": preparedFile.contentType || source.contentType,
        },
        body: source.blob,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`${source.label} 上传失败：${response.status}`);
      }
      frame.uploadedFiles += 1;
      frame.progress = clampProgress(frame.uploadedFiles / frame.totalFiles);
      this.uploadedFiles += 1;
      this.emitSoon();
    } finally {
      release?.();
      this.abortControllers.delete(controller);
      batchControllers?.delete(controller);
    }
  }

  private async uploadPreparedFiles(frame: RunnerFrameState, files: PreparedUploadFile[]) {
    let cursor = 0;
    let firstError: unknown = null;
    const batchControllers = new Set<AbortController>();
    const workerCount = Math.max(1, Math.min(this.fileUploadConcurrency, files.length));
    const workers = Array.from({ length: workerCount }, async () => {
      while (!this.paused && !firstError) {
        const file = files[cursor];
        cursor += 1;
        if (!file) {
          return;
        }

        try {
          await this.uploadPreparedFile(frame, file, batchControllers);
        } catch (error) {
          if (!firstError) {
            firstError = error;
            for (const controller of batchControllers) {
              controller.abort();
            }
          }
        }
      }
    });

    // Presigned PUT latency dominates small generated assets. Upload the files in a frame together,
    // then wait before committing so the database still observes one serial frame commit.
    await Promise.all(workers);
    if (firstError) {
      throw firstError;
    }
  }

  private async commitFrame(frame: RunnerFrameState) {
    const task = this.commitQueue.then(() =>
      commitGroupUploadFrame({
        groupUploadJobId: this.requireJobId(),
        frameOrder: frame.order,
      }),
    );
    this.commitQueue = task.then(
      () => undefined,
      () => undefined,
    );
    await task;
    this.committedFrameOrders.add(frame.order);
    this.committedCount = this.committedFrameOrders.size;
    this.uploadedFiles += Math.max(0, frame.totalFiles - frame.uploadedFiles);
    frame.status = "committed";
    frame.progress = 1;
    frame.uploadedFiles = frame.totalFiles;
    frame.error = undefined;
    this.message = `${frame.title} 已提交。`;
    this.emitSoon();
  }
}
