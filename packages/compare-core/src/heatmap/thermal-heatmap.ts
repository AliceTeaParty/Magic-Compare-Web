export const THERMAL_HEATMAP_ALGORITHM_ID = "thermal-v1";

interface ThermalHeatmapAlgorithm {
  id: typeof THERMAL_HEATMAP_ALGORITHM_ID;
  render(before: ImageData, comparison: ImageData): Promise<ImageData>;
}

const HEATMAP_COLOR_STOPS: Array<[number, [number, number, number]]> = [
  [0, [9, 13, 27]],
  [36, [22, 69, 89]],
  [86, [57, 154, 110]],
  [140, [202, 206, 84]],
  [196, [241, 149, 58]],
  [255, [216, 54, 39]],
];

function heatmapColor(value: number) {
  for (let index = 0; index < HEATMAP_COLOR_STOPS.length - 1; index += 1) {
    const [leftValue, leftColor] = HEATMAP_COLOR_STOPS[index];
    const [rightValue, rightColor] = HEATMAP_COLOR_STOPS[index + 1];
    if (value <= rightValue) {
      const progress = (value - leftValue) / Math.max(rightValue - leftValue, 1);
      return leftColor.map((channel, channelIndex) =>
        Math.round(channel + (rightColor[channelIndex] - channel) * progress),
      ) as [number, number, number];
    }
  }

  return HEATMAP_COLOR_STOPS.at(-1)![1];
}

function grayscaleDifference(beforeData: ImageData, comparisonData: ImageData) {
  const values = new Uint8ClampedArray(beforeData.width * beforeData.height);
  for (
    let sourceIndex = 0, targetIndex = 0;
    sourceIndex < beforeData.data.length;
    sourceIndex += 4, targetIndex += 1
  ) {
    const diff =
      Math.abs(beforeData.data[sourceIndex] - comparisonData.data[sourceIndex]) * 0.299 +
      Math.abs(beforeData.data[sourceIndex + 1] - comparisonData.data[sourceIndex + 1]) * 0.587 +
      Math.abs(beforeData.data[sourceIndex + 2] - comparisonData.data[sourceIndex + 2]) * 0.114;
    values[targetIndex] = Math.round((diff / 255) ** 0.72 * 255);
  }
  return values;
}

function blurredIntensity(
  values: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  scale = 1,
) {
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
  for (
    let pixelIndex = 0, dataIndex = 0;
    pixelIndex < intensity.length;
    pixelIndex += 1, dataIndex += 4
  ) {
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
    throw new Error("Browser could not create the heatmap glow canvas.");
  }
  sourceContext.putImageData(imageData, 0, 0);

  const output = new OffscreenCanvas(imageData.width, imageData.height);
  const outputContext = output.getContext("2d");
  if (!outputContext) {
    throw new Error("Browser could not create the heatmap glow canvas.");
  }
  outputContext.filter = `blur(${radius}px)`;
  outputContext.drawImage(source, 0, 0);
  return outputContext.getImageData(0, 0, imageData.width, imageData.height);
}

function blendImageData(left: ImageData, right: ImageData, rightWeight: number) {
  const output = new ImageData(left.width, left.height);
  const leftWeight = 1 - rightWeight;
  for (let index = 0; index < left.data.length; index += 4) {
    output.data[index] = Math.round(
      left.data[index] * leftWeight + right.data[index] * rightWeight,
    );
    output.data[index + 1] = Math.round(
      left.data[index + 1] * leftWeight + right.data[index + 1] * rightWeight,
    );
    output.data[index + 2] = Math.round(
      left.data[index + 2] * leftWeight + right.data[index + 2] * rightWeight,
    );
    output.data[index + 3] = 255;
  }
  return output;
}

/**
 * Keeps the browser heatmap recipe versioned and independent from file decoding or PNG encoding.
 * Future local-cache keys must include this id plus both immutable asset identities and dimensions.
 */
async function renderThermalHeatmap(before: ImageData, comparison: ImageData): Promise<ImageData> {
  if (before.width !== comparison.width || before.height !== comparison.height) {
    throw new Error("Heatmap sources must have matching dimensions.");
  }

  const lifted = grayscaleDifference(before, comparison);
  const core = blurredIntensity(lifted, before.width, before.height, 1.1);
  const halo = blurredIntensity(lifted, before.width, before.height, 4.6, 0.82);
  const intensity = new Uint8ClampedArray(lifted.length);
  for (let index = 0; index < lifted.length; index += 1) {
    intensity[index] = Math.max(core[index], halo[index]);
  }

  const thermal = thermalImageData(intensity, before.width, before.height);
  const glow = await blurImageData(thermal, 3.4);
  return blendImageData(glow, thermal, 0.66);
}

export const THERMAL_HEATMAP_ALGORITHM: ThermalHeatmapAlgorithm = {
  id: THERMAL_HEATMAP_ALGORITHM_ID,
  render: renderThermalHeatmap,
};
