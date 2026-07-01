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

function grayscaleDifference(beforeData: ImageData, afterData: ImageData) {
  const values = new Uint8ClampedArray(beforeData.width * beforeData.height);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < beforeData.data.length; sourceIndex += 4, targetIndex += 1) {
    const diff =
      Math.abs(beforeData.data[sourceIndex] - afterData.data[sourceIndex]) * 0.299 +
      Math.abs(beforeData.data[sourceIndex + 1] - afterData.data[sourceIndex + 1]) * 0.587 +
      Math.abs(beforeData.data[sourceIndex + 2] - afterData.data[sourceIndex + 2]) * 0.114;
    values[targetIndex] = Math.round(((diff / 255) ** 0.72) * 255);
  }
  return values;
}

function blurredIntensity(values: Uint8ClampedArray, width: number, height: number, radius: number, scale = 1) {
  const output = new Uint8ClampedArray(values.length);
  const integerRadius = Math.max(1, Math.ceil(radius * 2));
  const sigma = Math.max(radius, 0.1);
  const weights: number[] = [];
  let totalWeight = 0;
  for (let offset = -integerRadius; offset <= integerRadius; offset += 1) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    weights.push(weight);
    totalWeight += weight;
  }

  const horizontal = new Float32Array(values.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let offset = -integerRadius; offset <= integerRadius; offset += 1) {
        const sampleX = Math.min(width - 1, Math.max(0, x + offset));
        sum += values[y * width + sampleX] * weights[offset + integerRadius];
      }
      horizontal[y * width + x] = sum / totalWeight;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let offset = -integerRadius; offset <= integerRadius; offset += 1) {
        const sampleY = Math.min(height - 1, Math.max(0, y + offset));
        sum += horizontal[sampleY * width + x] * weights[offset + integerRadius];
      }
      output[y * width + x] = Math.min(255, Math.round((sum / totalWeight) * scale));
    }
  }

  return output;
}

function thermalImageData(intensity: Uint8ClampedArray, width: number, height: number) {
  const output = new ImageData(width, height);
  for (let pixelIndex = 0, dataIndex = 0; pixelIndex < intensity.length; pixelIndex += 1, dataIndex += 4) {
    const [red, green, blue] = heatmapColor(intensity[pixelIndex]);
    output.data[dataIndex] = red;
    output.data[dataIndex + 1] = green;
    output.data[dataIndex + 2] = blue;
    output.data[dataIndex + 3] = 255;
  }
  return output;
}

async function blurImageData(imageData: ImageData, radius: number) {
  const source = new OffscreenCanvas(imageData.width, imageData.height);
  const sourceContext = source.getContext("2d");
  if (!sourceContext) {
    throw new Error("浏览器无法创建 heatmap glow 画布。");
  }
  sourceContext.putImageData(imageData, 0, 0);

  const output = new OffscreenCanvas(imageData.width, imageData.height);
  const outputContext = output.getContext("2d");
  if (!outputContext) {
    throw new Error("浏览器无法创建 heatmap glow 画布。");
  }
  outputContext.filter = `blur(${radius}px)`;
  outputContext.drawImage(source, 0, 0);
  return outputContext.getImageData(0, 0, imageData.width, imageData.height);
}

function blendImageData(left: ImageData, right: ImageData, rightWeight: number) {
  const output = new ImageData(left.width, left.height);
  const leftWeight = 1 - rightWeight;
  for (let index = 0; index < left.data.length; index += 4) {
    output.data[index] = Math.round(left.data[index] * leftWeight + right.data[index] * rightWeight);
    output.data[index + 1] = Math.round(left.data[index + 1] * leftWeight + right.data[index + 1] * rightWeight);
    output.data[index + 2] = Math.round(left.data[index + 2] * leftWeight + right.data[index + 2] * rightWeight);
    output.data[index + 3] = 255;
  }
  return output;
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

  const lifted = grayscaleDifference(beforeData, afterData);
  const core = blurredIntensity(lifted, beforeData.width, beforeData.height, 1.1);
  const halo = blurredIntensity(lifted, beforeData.width, beforeData.height, 4.6, 0.82);
  const intensity = new Uint8ClampedArray(lifted.length);
  for (let index = 0; index < lifted.length; index += 1) {
    intensity[index] = Math.max(core[index], halo[index]);
  }

  const thermal = thermalImageData(intensity, beforeData.width, beforeData.height);
  const glow = await blurImageData(thermal, 3.4);
  const diffused = blendImageData(glow, thermal, 0.66);

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
