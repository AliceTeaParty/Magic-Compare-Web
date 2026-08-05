import type {
  UploadStreamFrameDescriptor,
  UploadStreamSourceAssetDescriptor,
} from "@/lib/server/uploads/contracts";
import type {
  GeneratedUploadAsset,
  GeneratedUploadFile,
  GeneratedUploadFrame,
  WebUploadAssetPlan,
  WebUploadFramePlan,
} from "./web-upload-types";

interface WorkerUploadFile {
  extension: string;
  contentType: string;
  sha256: string;
  size: number;
  blob: Blob;
}

interface WorkerPreflightResult {
  assetKey: string;
  width: number;
  height: number;
  extension: string;
  contentType: string;
  sha256: string;
  size: number;
}

interface WorkerAssetResult {
  assetKey: string;
  width: number;
  height: number;
  original: WorkerUploadFile;
  thumbnail: WorkerUploadFile;
  heatmap?: WorkerUploadFile;
}

type WorkerResponse =
  | { type: "preflight-complete"; requestId: string; result: WorkerPreflightResult }
  | { type: "asset-complete"; requestId: string; result: WorkerAssetResult }
  | { type: "asset-error"; requestId: string; assetKey: string; error: string };

export interface GenerationProgress {
  completed: number;
  total: number;
  label: string;
}

export interface PreflightedUploadFrame {
  plan: WebUploadFramePlan;
  descriptor: UploadStreamFrameDescriptor;
  sources: Map<
    string,
    {
      asset: WebUploadAssetPlan;
      preflight: WorkerPreflightResult;
    }
  >;
}

export interface PreflightUploadOptions {
  heatmapReferenceLabel: string;
  signal?: AbortSignal;
}

export interface GenerateUploadFrameOptions {
  signal?: AbortSignal;
  onProgress?: (progress: GenerationProgress) => void;
}

// Upload stays serial until the upload workspace redesign can expose an explicit 1/2/3 Worker
// choice without adding another temporary control to the current page.
export const WEB_UPLOAD_WORKER_CONCURRENCY = 1;

function workerUploadFileToGenerated(file: WorkerUploadFile): GeneratedUploadFile {
  return {
    blob: file.blob,
    extension: file.extension,
    contentType: file.contentType,
    sha256: file.sha256,
    size: file.size,
  };
}

function createWorker() {
  return new Worker(new URL("./asset-worker.ts", import.meta.url), {
    type: "module",
  });
}

/** Owns one worker and rejects pending work when upload pause/dispose terminates it. */
class WebUploadAssetWorkerClient {
  private readonly worker = createWorker();
  private readonly pending = new Map<
    string,
    {
      resolve: (result: WorkerAssetResult | WorkerPreflightResult) => void;
      reject: (error: Error) => void;
      cleanup: () => void;
    }
  >();
  private requestCounter = 0;

  constructor() {
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const payload = event.data;
      const request = this.pending.get(payload.requestId);
      if (!request) return;

      this.pending.delete(payload.requestId);
      request.cleanup();
      if (payload.type === "asset-error") {
        request.reject(new Error(payload.error));
      } else {
        request.resolve(payload.result);
      }
    });
  }

  dispose(error = new DOMException("Upload generation was abandoned.", "AbortError")) {
    this.worker.terminate();
    for (const request of this.pending.values()) {
      request.cleanup();
      request.reject(error);
    }
    this.pending.clear();
  }

  private request<T extends WorkerAssetResult | WorkerPreflightResult>(
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(new DOMException("Upload generation was abandoned.", "AbortError"));
    }
    const requestId = `asset-${this.requestCounter}`;
    this.requestCounter += 1;
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        const request = this.pending.get(requestId);
        if (!request) return;
        this.pending.delete(requestId);
        request.cleanup();
        reject(new DOMException("Upload generation was abandoned.", "AbortError"));
      };
      const cleanup = () => signal?.removeEventListener("abort", abort);
      signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(requestId, {
        resolve: (result) => resolve(result as T),
        reject,
        cleanup,
      });
      this.worker.postMessage({ ...payload, requestId });
    });
  }

  preflightAsset(assetKey: string, original: File, signal?: AbortSignal) {
    return this.request<WorkerPreflightResult>(
      { type: "preflight-asset", assetKey, original },
      signal,
    );
  }

  generateAsset(params: {
    assetKey: string;
    original: File;
    preflight: WorkerPreflightResult;
    heatmapBefore?: File;
    heatmapAfter?: File;
    signal?: AbortSignal;
  }) {
    return this.request<WorkerAssetResult>(
      {
        type: "generate-asset",
        assetKey: params.assetKey,
        original: params.original,
        preflight: params.preflight,
        heatmapBefore: params.heatmapBefore,
        heatmapAfter: params.heatmapAfter,
      },
      params.signal,
    );
  }
}

function plannedAssets(frame: WebUploadFramePlan) {
  return [
    { slot: "slot-001", asset: frame.before },
    { slot: "slot-002", asset: frame.after },
    ...(frame.heatmap ? [{ slot: "slot-003", asset: frame.heatmap }] : []),
    ...frame.misc.map((asset, index) => ({
      slot: `slot-${String(index + 4).padStart(3, "0")}`,
      asset,
    })),
  ];
}

function selectedHeatmapSource(frame: WebUploadFramePlan, referenceLabel: string) {
  const selected = plannedAssets(frame).find(
    ({ asset }) =>
      asset !== frame.before && asset.kind !== "heatmap" && asset.label === referenceLabel,
  );
  if (!selected) {
    throw new Error(`${frame.title} 不存在 heatmap 参考列 ${referenceLabel}。`);
  }
  return selected;
}

function sourceDescriptor(
  slot: string,
  asset: WebUploadAssetPlan,
  preflight: WorkerPreflightResult,
): UploadStreamSourceAssetDescriptor {
  return {
    slot,
    kind: asset.kind,
    label: asset.label,
    note: asset.note,
    width: preflight.width,
    height: preflight.height,
    isPrimaryDisplay: asset.kind === "before" || asset.kind === "after",
    original: {
      extension: preflight.extension,
      contentType: preflight.contentType,
      sha256: preflight.sha256,
      size: preflight.size,
    },
  };
}

/**
 * Decodes, dimensions-checks, and hashes the complete source set before a server job can start.
 * The result contains descriptors only, not derived thumbnail/heatmap blobs.
 */
export async function preflightUploadFrames(
  frames: WebUploadFramePlan[],
  onProgress: (progress: GenerationProgress) => void,
  options: PreflightUploadOptions,
): Promise<PreflightedUploadFrame[]> {
  const tasks = frames.flatMap((frame) =>
    plannedAssets(frame).map(({ slot, asset }) => ({ frame, slot, asset })),
  );
  const results = new Map<number, PreflightedUploadFrame["sources"]>();
  const clients = Array.from(
    { length: Math.min(WEB_UPLOAD_WORKER_CONCURRENCY, Math.max(1, tasks.length)) },
    () => new WebUploadAssetWorkerClient(),
  );
  let cursor = 0;
  let completed = 0;

  try {
    await Promise.all(
      clients.map(async (client) => {
        while (cursor < tasks.length) {
          const task = tasks[cursor];
          cursor += 1;
          const preflight = await client.preflightAsset(
            `${task.frame.order}:${task.slot}`,
            task.asset.source.file,
            options.signal,
          );
          const frameSources = results.get(task.frame.order) ?? new Map();
          frameSources.set(task.slot, { asset: task.asset, preflight });
          results.set(task.frame.order, frameSources);
          completed += 1;
          onProgress({ completed, total: tasks.length, label: task.asset.source.relativePath });
        }
      }),
    );
  } finally {
    for (const client of clients) client.dispose();
  }

  return frames.map((frame) => {
    const sources = results.get(frame.order);
    if (!sources || sources.size !== plannedAssets(frame).length) {
      throw new Error(`${frame.title} 的素材预检没有完整结束。`);
    }
    const before = sources.get("slot-001")!.preflight;
    for (const { asset, preflight } of sources.values()) {
      if (preflight.width !== before.width || preflight.height !== before.height) {
        throw new Error(`${frame.title} 的 ${asset.label} 与 Before 尺寸不一致。`);
      }
    }

    // Explicit heatmaps are already source assets and must not depend on a generated-heatmap
    // reference column shared by unrelated frames.
    const reference = frame.heatmap
      ? null
      : selectedHeatmapSource(frame, options.heatmapReferenceLabel);
    if (
      !frame.heatmap &&
      (before.extension === ".svg" || sources.get(reference!.slot)!.preflight.extension === ".svg")
    ) {
      throw new Error(`${frame.title} 使用 SVG 时必须提供显式 heatmap。`);
    }

    return {
      plan: frame,
      sources,
      descriptor: {
        order: frame.order,
        title: frame.title,
        caption: frame.caption,
        assets: plannedAssets(frame).map(({ slot, asset }) =>
          sourceDescriptor(slot, asset, sources.get(slot)!.preflight),
        ),
        generatedHeatmap: frame.heatmap
          ? null
          : {
              slot: "slot-003",
              beforeSlot: "slot-001",
              afterSlot: reference!.slot,
            },
      },
    };
  });
}

function generatedAsset(
  asset: WebUploadAssetPlan,
  slot: string,
  result: WorkerAssetResult,
): GeneratedUploadAsset {
  return {
    slot,
    kind: asset.kind,
    label: asset.label,
    note: asset.note,
    width: result.width,
    height: result.height,
    isPrimaryDisplay: asset.kind === "before" || asset.kind === "after",
    original: workerUploadFileToGenerated(result.original),
    thumbnail: workerUploadFileToGenerated(result.thumbnail),
  };
}

/** Generates one preflighted frame in an isolated worker so pause can terminate CPU work. */
export async function generateUploadFrame(
  frame: PreflightedUploadFrame,
  options: GenerateUploadFrameOptions = {},
): Promise<GeneratedUploadFrame> {
  const worker = new WebUploadAssetWorkerClient();
  const planned = plannedAssets(frame.plan);
  const total = planned.length + (frame.descriptor.generatedHeatmap ? 1 : 0);
  let completed = 0;
  const tick = (label: string) => {
    completed += 1;
    options.onProgress?.({ completed, total, label });
  };

  try {
    const reference = frame.descriptor.generatedHeatmap
      ? selectedHeatmapSource(
          frame.plan,
          frame.sources.get(frame.descriptor.generatedHeatmap.afterSlot)!.asset.label,
        )
      : null;
    const assets: GeneratedUploadAsset[] = [];
    for (const { slot, asset } of planned) {
      const source = frame.sources.get(slot)!;
      const shouldGenerateHeatmap = slot === "slot-002" && frame.descriptor.generatedHeatmap;
      const result = await worker.generateAsset({
        assetKey: `${frame.plan.order}:${slot}`,
        original: asset.source.file,
        preflight: source.preflight,
        heatmapBefore: shouldGenerateHeatmap ? frame.plan.before.source.file : undefined,
        heatmapAfter: shouldGenerateHeatmap ? reference!.asset.source.file : undefined,
        signal: options.signal,
      });
      assets.push(generatedAsset(asset, slot, result));
      tick(`${frame.plan.title} ${asset.label}`);

      if (shouldGenerateHeatmap) {
        if (!result.heatmap) throw new Error(`${frame.plan.title} 没有生成 heatmap。`);
        assets.push({
          slot: frame.descriptor.generatedHeatmap!.slot,
          kind: "heatmap",
          label: "Heatmap",
          note: `Auto-generated from ${frame.plan.before.source.relativePath} vs ${reference!.asset.source.relativePath}`,
          width: result.width,
          height: result.height,
          isPrimaryDisplay: false,
          original: workerUploadFileToGenerated(result.heatmap),
          thumbnail: workerUploadFileToGenerated(result.heatmap),
        });
        tick(`${frame.plan.title} Heatmap`);
      }
    }

    return {
      order: frame.plan.order,
      title: frame.plan.title,
      caption: frame.plan.caption,
      assets: assets.sort((left, right) => left.slot.localeCompare(right.slot)),
    };
  } finally {
    worker.dispose();
  }
}
