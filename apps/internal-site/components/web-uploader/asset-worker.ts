import { THERMAL_HEATMAP_ALGORITHM } from "@magic-compare/compare-core/heatmap";

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

interface WorkerPreflightResult {
  assetKey: string;
  width: number;
  height: number;
  extension: string;
  contentType: string;
  sha256: string;
  size: number;
}

interface PreflightAssetMessage {
  type: "preflight-asset";
  requestId: string;
  assetKey: string;
  original: File;
}

interface GenerateAssetMessage {
  type: "generate-asset";
  requestId: string;
  assetKey: string;
  original: File;
  preflight: WorkerPreflightResult;
  heatmapBefore?: File;
  heatmapAfter?: File;
}

type WorkerRequestMessage = GenerateAssetMessage | PreflightAssetMessage;

const THUMBNAIL_MAX_WIDTH = 480;
const THUMBNAIL_MAX_HEIGHT = 270;

function extensionForFile(file: File) {
  const dotIndex = file.name.lastIndexOf(".");
  return dotIndex === -1 ? ".bin" : file.name.slice(dotIndex).toLowerCase();
}

function contentTypeForFile(file: File) {
  return file.type || "application/octet-stream";
}

async function sha256Hex(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function uploadFileDescriptor(
  file: Blob,
  extension: string,
  contentType: string,
): Promise<WorkerUploadFile> {
  return {
    extension,
    contentType,
    sha256: await sha256Hex(file),
    size: file.size,
    blob: file,
  };
}

function parseSvgDimensions(text: string) {
  const viewBox = text.match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (viewBox) {
    return {
      width: Math.max(1, Math.round(Number(viewBox[1]))),
      height: Math.max(1, Math.round(Number(viewBox[2]))),
    };
  }

  const width = text.match(/\bwidth=["']([\d.]+)(?:px)?["']/i)?.[1];
  const height = text.match(/\bheight=["']([\d.]+)(?:px)?["']/i)?.[1];
  return {
    width: Math.max(1, Math.round(Number(width) || 1280)),
    height: Math.max(1, Math.round(Number(height) || 720)),
  };
}

async function imageDimensions(file: File) {
  if (extensionForFile(file) === ".svg") {
    return parseSvgDimensions(await file.text());
  }

  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

function thumbnailSize(width: number, height: number) {
  const scale = Math.min(THUMBNAIL_MAX_WIDTH / width, THUMBNAIL_MAX_HEIGHT / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function canvasToBlob(canvas: OffscreenCanvas, contentType = "image/webp", quality = 0.82) {
  const blob = await canvas.convertToBlob({ type: contentType, quality });
  return blob.size > 0 ? blob : await canvas.convertToBlob({ type: "image/png" });
}

async function buildThumbnail(
  file: File,
  width: number,
  height: number,
  preflight: WorkerPreflightResult,
) {
  if (extensionForFile(file) === ".svg") {
    return {
      extension: preflight.extension,
      contentType: preflight.contentType,
      sha256: preflight.sha256,
      size: preflight.size,
      blob: file,
    };
  }

  const bitmap = await createImageBitmap(file);
  const size = thumbnailSize(width, height);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("浏览器无法创建缩略图画布。");
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await canvasToBlob(canvas);
  // WebKit may return PNG when its canvas cannot encode WebP. The extension must describe the
  // actual bytes, otherwise upload commit rejects an otherwise valid Safari-generated thumbnail.
  return uploadFileDescriptor(
    blob,
    blob.type === "image/webp" ? ".webp" : ".png",
    blob.type || "image/png",
  );
}

async function bitmapToImageData(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("浏览器无法读取图片像素。");
  }
  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return imageData;
}

async function buildHeatmap(before: File, after: File) {
  if (extensionForFile(before) === ".svg" || extensionForFile(after) === ".svg") {
    throw new Error("浏览器 heatmap 生成暂不支持 SVG，请提供显式 heatmap 文件。");
  }

  const beforeData = await bitmapToImageData(before);
  const afterData = await bitmapToImageData(after);
  const diffused = await THERMAL_HEATMAP_ALGORITHM.render(beforeData, afterData);

  const canvas = new OffscreenCanvas(diffused.width, diffused.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("浏览器无法创建 heatmap 画布。");
  }
  context.putImageData(diffused, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return uploadFileDescriptor(blob, ".png", "image/png");
}

async function handleGenerateAsset(message: GenerateAssetMessage): Promise<WorkerAssetResult> {
  const dimensions = { width: message.preflight.width, height: message.preflight.height };
  const original: WorkerUploadFile = {
    extension: message.preflight.extension,
    contentType: message.preflight.contentType,
    sha256: message.preflight.sha256,
    size: message.preflight.size,
    blob: message.original,
  };
  const thumbnail = await buildThumbnail(
    message.original,
    dimensions.width,
    dimensions.height,
    message.preflight,
  );
  const heatmap =
    message.heatmapBefore && message.heatmapAfter
      ? await buildHeatmap(message.heatmapBefore, message.heatmapAfter)
      : undefined;

  return {
    assetKey: message.assetKey,
    width: dimensions.width,
    height: dimensions.height,
    original,
    thumbnail,
    heatmap,
  };
}

/** Decodes and hashes every selected source before the upload job or any PUT can begin. */
async function handlePreflightAsset(
  message: PreflightAssetMessage,
): Promise<WorkerPreflightResult> {
  const dimensions = await imageDimensions(message.original);
  return {
    assetKey: message.assetKey,
    ...dimensions,
    extension: extensionForFile(message.original),
    contentType: contentTypeForFile(message.original),
    sha256: await sha256Hex(message.original),
    size: message.original.size,
  };
}

self.addEventListener("message", (event: MessageEvent<WorkerRequestMessage>) => {
  const message = event.data;
  if (message.type === "preflight-asset") {
    void handlePreflightAsset(message)
      .then((result) => {
        self.postMessage({ type: "preflight-complete", requestId: message.requestId, result });
      })
      .catch((error: unknown) => {
        self.postMessage({
          type: "asset-error",
          requestId: message.requestId,
          assetKey: message.assetKey,
          error: error instanceof Error ? error.message : "资源预检失败。",
        });
      });
    return;
  }

  void handleGenerateAsset(message)
    .then((result) => {
      self.postMessage({ type: "asset-complete", requestId: message.requestId, result });
    })
    .catch((error: unknown) => {
      self.postMessage({
        type: "asset-error",
        requestId: message.requestId,
        assetKey: message.assetKey,
        error: error instanceof Error ? error.message : "资源生成失败。",
      });
    });
});

export {};
