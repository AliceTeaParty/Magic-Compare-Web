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

interface GenerateAssetMessage {
  type: "generate-asset";
  requestId: string;
  assetKey: string;
  original: File;
  heatmapBefore?: File;
  heatmapAfter?: File;
}

type WorkerRequestMessage = GenerateAssetMessage;

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
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadFileDescriptor(file: Blob, extension: string, contentType: string): Promise<WorkerUploadFile> {
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

async function buildThumbnail(file: File, width: number, height: number) {
  if (extensionForFile(file) === ".svg") {
    return uploadFileDescriptor(file, extensionForFile(file), contentTypeForFile(file));
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
  return uploadFileDescriptor(blob, ".webp", blob.type || "image/webp");
}

function heatmapColor(value: number) {
  const stops: Array<[number, [number, number, number]]> = [
    [0, [9, 13, 27]],
    [36, [22, 69, 89]],
    [86, [57, 154, 110]],
    [140, [202, 206, 84]],
    [196, [241, 149, 58]],
    [255, [216, 54, 39]],
  ];

  for (let index = 0; index < stops.length - 1; index += 1) {
    const [leftValue, leftColor] = stops[index];
    const [rightValue, rightColor] = stops[index + 1];
    if (value <= rightValue) {
      const progress = (value - leftValue) / Math.max(rightValue - leftValue, 1);
      return leftColor.map((channel, channelIndex) =>
        Math.round(channel + (rightColor[channelIndex] - channel) * progress),
      ) as [number, number, number];
    }
  }

  return stops.at(-1)![1];
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
  if (beforeData.width !== afterData.width || beforeData.height !== afterData.height) {
    throw new Error("before 与 after 尺寸不一致，无法生成 heatmap。");
  }

  const output = new ImageData(beforeData.width, beforeData.height);
  for (let index = 0; index < beforeData.data.length; index += 4) {
    const diff =
      Math.abs(beforeData.data[index] - afterData.data[index]) * 0.299 +
      Math.abs(beforeData.data[index + 1] - afterData.data[index + 1]) * 0.587 +
      Math.abs(beforeData.data[index + 2] - afterData.data[index + 2]) * 0.114;
    const lifted = Math.round(((diff / 255) ** 0.72) * 255);
    const [red, green, blue] = heatmapColor(lifted);
    output.data[index] = red;
    output.data[index + 1] = green;
    output.data[index + 2] = blue;
    output.data[index + 3] = 255;
  }

  const canvas = new OffscreenCanvas(output.width, output.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("浏览器无法创建 heatmap 画布。");
  }
  context.putImageData(output, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return uploadFileDescriptor(blob, ".png", "image/png");
}

async function handleGenerateAsset(message: GenerateAssetMessage): Promise<WorkerAssetResult> {
  const dimensions = await imageDimensions(message.original);
  const original = await uploadFileDescriptor(
    message.original,
    extensionForFile(message.original),
    contentTypeForFile(message.original),
  );
  const thumbnail = await buildThumbnail(message.original, dimensions.width, dimensions.height);
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

self.addEventListener("message", (event: MessageEvent<WorkerRequestMessage>) => {
  const message = event.data;
  if (message.type !== "generate-asset") {
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
