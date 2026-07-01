import type {
  GroupUploadStartInput,
  UploadAssetDescriptor,
} from "@/lib/server/uploads/contracts";
import {
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

type UploadFileVariant = "original" | "thumbnail";
type RunnerListener = (snapshot: UploadRunnerSnapshot) => void;

interface UploadRunnerOptions {
  caseInput: GroupUploadStartInput["case"];
  groupInput: WebUploadGroupMetadata;
  frames: GeneratedUploadFrame[];
  uploadConcurrency?: number;
}

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

function uploadFileKey(
  frameOrder: number,
  slot: string,
  variant: UploadFileVariant,
) {
  return `${frameOrder}:${slot}:${variant}`;
}

/**
 * Builds the server upload payload and local Blob lookup together so the descriptor order and PUT
 * body map cannot drift while React still avoids holding large File/Blob objects in state.
 */
function buildUploadPlan(options: UploadRunnerOptions) {
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

/**
 * Owns the browser upload state machine so the page only subscribes to throttled summaries while
 * File/Blob objects, AbortControllers, and transient progress remain outside React state.
 */
export class WebUploadRunner {
  private readonly payload: GroupUploadStartInput;
  private readonly filesByKey: Map<string, UploadFileSource>;
  private readonly uploadConcurrency: number;
  private readonly listeners = new Set<RunnerListener>();
  private readonly abortControllers = new Set<AbortController>();
  private readonly frames = new Map<number, RunnerFrameState>();
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  private jobId: string | null = null;
  private inputHash: string | null = null;
  private stage: WebUploadStage = "ready";
  private message = "准备上传。";
  private paused = false;
  private running = false;
  private commitQueue = Promise.resolve();
  private uploadedFiles = 0;
  private totalFiles = 0;
  private failedCount = 0;
  private retriedCount = 0;
  private committedCount = 0;
  private committedFrameOrders = new Set<number>();

  constructor(options: UploadRunnerOptions) {
    const plan = buildUploadPlan(options);
    this.payload = plan.payload;
    this.filesByKey = plan.filesByKey;
    this.uploadConcurrency = options.uploadConcurrency ?? DEFAULT_UPLOAD_CONCURRENCY;

    for (const frame of options.frames) {
      const totalFiles = frame.assets.length * 2;
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
    for (const controller of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.emitSoon();
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
      const startResult = await startGroupUpload(this.payload);
      this.jobId = startResult.groupUploadJobId;
      this.inputHash = startResult.inputHash;
      this.applyServerFrameStates(startResult.frameStates);

      const pendingFrames = [...this.frames.values()]
        .filter((frame) => frame.status !== "committed")
        .sort((left, right) => left.order - right.order);

      await this.runFramePool(pendingFrames);

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
      this.stage = "completed";
      this.message = "上传完成。";
      this.emitSoon();
    } catch (error) {
      if (this.paused) {
        this.stage = "paused";
        this.message = "已暂停，可继续上传。";
      } else {
        this.stage = "failed";
        this.message = error instanceof Error ? error.message : "上传失败。";
      }
      this.emitSoon();
    } finally {
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
      states
        .filter((frame) => frame.status === "committed")
        .map((frame) => frame.frameOrder),
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
    frame.status = "preparing";
    frame.error = undefined;
    this.message = `正在准备 ${frame.title}。`;
    this.emitSoon();

    try {
      const prepared = await prepareGroupUploadFrame({
        groupUploadJobId: this.requireJobId(),
        frameOrder: frame.order,
      });

      frame.status = "uploading";
      this.message = `正在上传 ${frame.title}。`;
      this.emitSoon();

      for (const file of prepared.files) {
        if (this.paused) {
          return;
        }
        await this.uploadPreparedFile(frame, file);
      }

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
    }
  }

  private async uploadPreparedFile(
    frame: RunnerFrameState,
    preparedFile: PreparedUploadFile,
  ) {
    const source = this.filesByKey.get(
      uploadFileKey(frame.order, preparedFile.slot, preparedFile.variant),
    );
    if (!source) {
      throw new Error(`找不到 ${frame.title} 的本地文件。`);
    }

    const controller = new AbortController();
    this.abortControllers.add(controller);
    try {
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
      this.abortControllers.delete(controller);
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
    const result = await task;
    this.inputHash = result.inputHash;
    this.committedFrameOrders.add(frame.order);
    this.committedCount = result.committedFrameCount;
    this.uploadedFiles += Math.max(0, frame.totalFiles - frame.uploadedFiles);
    frame.status = "committed";
    frame.progress = 1;
    frame.uploadedFiles = frame.totalFiles;
    frame.error = undefined;
    this.message = `${frame.title} 已提交。`;
    this.emitSoon();
  }
}
