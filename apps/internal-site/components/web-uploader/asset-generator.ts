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

interface WorkerAssetResult {
  assetKey: string;
  width: number;
  height: number;
  original: WorkerUploadFile;
  thumbnail: WorkerUploadFile;
  heatmap?: WorkerUploadFile;
}

type WorkerResponse =
  | { type: "asset-complete"; requestId: string; result: WorkerAssetResult }
  | { type: "asset-error"; requestId: string; assetKey: string; error: string };

export interface GenerationProgress {
  completed: number;
  total: number;
  label: string;
}

export interface GenerateUploadFrameOptions {
  generateMissingHeatmap?: boolean;
}

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

/**
 * Serializes asset generation through one worker so large heatmap/canvas jobs do not saturate
 * memory or compete with React rendering on slower operator machines.
 */
class WebUploadAssetWorkerClient {
  private readonly worker = createWorker();
  private readonly pending = new Map<
    string,
    {
      resolve: (result: WorkerAssetResult) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor() {
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const payload = event.data;
      const request = this.pending.get(payload.requestId);
      if (!request) {
        return;
      }

      this.pending.delete(payload.requestId);
      if (payload.type === "asset-complete") {
        request.resolve(payload.result);
      } else {
        request.reject(new Error(payload.error));
      }
    });
  }

  dispose() {
    this.worker.terminate();
    this.pending.clear();
  }

  generateAsset(params: {
    assetKey: string;
    original: File;
    heatmapBefore?: File;
    heatmapAfter?: File;
  }) {
    const requestId = `${params.assetKey}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise<WorkerAssetResult>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({
        type: "generate-asset",
        requestId,
        assetKey: params.assetKey,
        original: params.original,
        heatmapBefore: params.heatmapBefore,
        heatmapAfter: params.heatmapAfter,
      });
    });
  }
}

function generatedAsset(
  frame: WebUploadFramePlan,
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

function generatedHeatmapAsset(
  frame: WebUploadFramePlan,
  heatmapAfter: WebUploadAssetPlan,
  result: WorkerAssetResult,
): GeneratedUploadAsset {
  if (!result.heatmap) {
    throw new Error(`${frame.title} 没有生成 heatmap。`);
  }

  return {
    slot: "slot-003",
    kind: "heatmap",
    label: "Heatmap",
    note: `Auto-generated from ${frame.before.source.relativePath} vs ${heatmapAfter.source.relativePath}`,
    width: result.width,
    height: result.height,
    isPrimaryDisplay: false,
    original: workerUploadFileToGenerated(result.heatmap),
    thumbnail: workerUploadFileToGenerated(result.heatmap),
  };
}

function heatmapAfterAsset(frame: WebUploadFramePlan) {
  const candidates = [frame.after, ...frame.misc];
  return (
    candidates.find((asset) => asset.label === frame.heatmapAfterLabel) ?? frame.after
  );
}

/**
 * Produces the upload API frame payload while keeping Blob/File descriptors in a caller-owned
 * structure for direct presigned PUTs.
 */
export async function generateUploadFrames(
  frames: WebUploadFramePlan[],
  onProgress: (progress: GenerationProgress) => void,
  options: GenerateUploadFrameOptions = {},
) {
  const generateMissingHeatmap = options.generateMissingHeatmap ?? true;
  const worker = new WebUploadAssetWorkerClient();
  const generatedFrames: GeneratedUploadFrame[] = [];
  const total = frames.reduce(
    (count, frame) =>
      count + 2 + frame.misc.length + (frame.heatmap || generateMissingHeatmap ? 1 : 0),
    0,
  );
  let completed = 0;

  function tick(label: string) {
    completed += 1;
    onProgress({ completed, total, label });
  }

  try {
    for (const frame of frames) {
      const beforeResult = await worker.generateAsset({
        assetKey: `${frame.order}:before`,
        original: frame.before.source.file,
      });
      tick(`${frame.title} before`);

      const selectedHeatmapAfter = heatmapAfterAsset(frame);
      const afterResult = await worker.generateAsset({
        assetKey: `${frame.order}:after`,
        original: frame.after.source.file,
        heatmapBefore: !frame.heatmap && generateMissingHeatmap ? frame.before.source.file : undefined,
        heatmapAfter: !frame.heatmap && generateMissingHeatmap ? selectedHeatmapAfter.source.file : undefined,
      });
      tick(`${frame.title} after`);

      const assets: GeneratedUploadAsset[] = [
        generatedAsset(frame, frame.before, "slot-001", beforeResult),
        generatedAsset(frame, frame.after, "slot-002", afterResult),
      ];

      if (frame.heatmap) {
        const heatmapResult = await worker.generateAsset({
          assetKey: `${frame.order}:heatmap`,
          original: frame.heatmap.source.file,
        });
        assets.push(generatedAsset(frame, frame.heatmap, "slot-003", heatmapResult));
        tick(`${frame.title} heatmap`);
      } else if (generateMissingHeatmap) {
        assets.push(generatedHeatmapAsset(frame, selectedHeatmapAfter, afterResult));
        tick(`${frame.title} heatmap`);
      }

      for (const [index, misc] of frame.misc.entries()) {
        const miscResult = await worker.generateAsset({
          assetKey: `${frame.order}:misc:${index}`,
          original: misc.source.file,
        });
        assets.push(generatedAsset(frame, misc, `slot-${String(index + 4).padStart(3, "0")}`, miscResult));
        tick(`${frame.title} ${misc.label}`);
      }

      generatedFrames.push({
        order: frame.order,
        title: frame.title,
        caption: frame.caption,
        assets,
      });
    }
  } finally {
    worker.dispose();
  }

  return generatedFrames;
}
