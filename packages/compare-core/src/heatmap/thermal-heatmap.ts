export const THERMAL_HEATMAP_ALGORITHM_ID = "regional-rms-v2";

export interface HeatmapRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

export interface HeatmapAnalysis {
  width: number;
  height: number;
  intensity: Float32Array;
  noiseFloor: number;
  autoCeiling: number;
  rms: number;
  changedFraction: number;
  regions: HeatmapRegion[];
}

// A monotonically brighter palette preserves boundaries without a decorative blur/glow pass.
export const HEATMAP_COLOR_STOPS: Array<[number, [number, number, number]]> = [
  [0, [12, 14, 18]],
  [0.2, [45, 37, 112]],
  [0.45, [172, 45, 113]],
  [0.7, [245, 105, 48]],
  [1, [255, 245, 160]],
];

/** An RGB RMS keeps chroma-only differences visible instead of cancelling them into luminance. */
function pixelEnergy(before: Uint8ClampedArray, after: Uint8ClampedArray, offset: number) {
  const beforeAlpha = before[offset + 3] / 255;
  const afterAlpha = after[offset + 3] / 255;
  let energy = 0;
  for (let channel = 0; channel < 3; channel++) {
    const delta = before[offset + channel] * beforeAlpha - after[offset + channel] * afterAlpha;
    energy += (delta * delta) / 3;
  }
  // Hidden RGB in fully transparent pixels must not become a hotspot.
  return Math.max(energy, (before[offset + 3] - after[offset + 3]) ** 2);
}

/** Sliding sums retain full-resolution error before pooling, so alternating compression noise cannot cancel. */
function localMean(values: Float32Array, width: number, height: number) {
  const radius = 2;
  const horizontal = new Float32Array(values.length);
  const output = new Float32Array(values.length);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < Math.min(width, radius); x++) sum += values[y * width + x];
    for (let x = 0; x < width; x++) {
      if (x + radius < width) sum += values[y * width + x + radius];
      if (x - radius - 1 >= 0) sum -= values[y * width + x - radius - 1];
      horizontal[y * width + x] =
        sum / (Math.min(width - 1, x + radius) - Math.max(0, x - radius) + 1);
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y < Math.min(height, radius); y++) sum += horizontal[y * width + x];
    for (let y = 0; y < height; y++) {
      if (y + radius < height) sum += horizontal[(y + radius) * width + x];
      if (y - radius - 1 >= 0) sum -= horizontal[(y - radius - 1) * width + x];
      output[y * width + x] = Math.max(
        0,
        sum / (Math.min(height - 1, y + radius) - Math.max(0, y - radius) + 1),
      );
    }
  }
  return output;
}

/** Rank spatially separated patches by absolute error, independent of display gain and palette. */
function strongestRegions(energy: Float32Array, width: number, height: number, minimum: number) {
  const tile = Math.max(16, Math.round(Math.min(width, height) / 24));
  const candidates: HeatmapRegion[] = [];
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      const w = Math.min(tile, width - x);
      const h = Math.min(tile, height - y);
      let sum = 0;
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) sum += energy[(y + dy) * width + x + dx];
      const score = Math.sqrt(sum / (w * h));
      if (score > minimum)
        candidates.push({
          x: x / width,
          y: y / height,
          width: w / width,
          height: h / height,
          score,
        });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  const regions: HeatmapRegion[] = [];
  for (const candidate of candidates) {
    if (
      regions.every(
        (region) =>
          Math.abs(region.x - candidate.x) > (2 * tile) / width ||
          Math.abs(region.y - candidate.y) > (2 * tile) / height,
      )
    )
      regions.push(candidate);
    if (regions.length === 6) break;
  }
  return regions;
}

/** Measure once; gain changes recolor these floating-point errors without decoding the originals again. */
export function analyzeHeatmap(
  before: ImageData,
  comparison: ImageData,
  noiseFloor = 1,
): HeatmapAnalysis {
  if (before.width !== comparison.width || before.height !== comparison.height)
    throw new Error("Heatmap sources must have matching dimensions.");
  const count = before.width * before.height;
  if (!count || before.data.length !== count * 4 || comparison.data.length !== count * 4)
    throw new Error("Heatmap sources have invalid pixel data.");
  if (!Number.isFinite(noiseFloor) || noiseFloor < 0) throw new Error("Invalid noise floor.");
  const energy = new Float32Array(count);
  let sum = 0;
  let changed = 0;
  for (let index = 0; index < count; index++) {
    energy[index] = pixelEnergy(before.data, comparison.data, index * 4);
    sum += energy[index];
    if (energy[index] > noiseFloor ** 2) changed++;
  }
  const rms = Math.sqrt(sum / count);
  const regions = strongestRegions(
    energy,
    before.width,
    before.height,
    Math.max(noiseFloor + 0.5, rms * 1.25),
  );
  const intensity = localMean(energy, before.width, before.height);
  const histogram = new Uint32Array(4081);
  for (let index = 0; index < count; index++) {
    intensity[index] = Math.max(0, Math.sqrt(intensity[index]) - noiseFloor);
    histogram[Math.min(4080, Math.round(intensity[index] * 16))]++;
  }
  let cumulative = 0;
  let percentile = 0;
  for (; percentile < histogram.length - 1; percentile++) {
    cumulative += histogram[percentile];
    if (cumulative >= count * 0.995) break;
  }
  // A fixed lower bound prevents near-identical frames from being stretched into alarming colors.
  const autoCeiling = Math.max(4, percentile / 16);
  return {
    width: before.width,
    height: before.height,
    intensity,
    noiseFloor,
    autoCeiling,
    rms,
    changedFraction: changed / count,
    regions,
  };
}

/** Color intensity is not a quality score; the legend exposes the actual error range. */
export function renderHeatmap(analysis: HeatmapAnalysis, gain = 1): ImageData {
  if (!Number.isFinite(gain) || gain <= 0) throw new Error("Invalid heatmap gain.");
  const output = new ImageData(analysis.width, analysis.height);
  for (let index = 0; index < analysis.intensity.length; index++) {
    const value = Math.min(1, (analysis.intensity[index] * gain) / analysis.autoCeiling) ** 0.75;
    let stop = 0;
    while (stop < HEATMAP_COLOR_STOPS.length - 2 && value > HEATMAP_COLOR_STOPS[stop + 1][0])
      stop++;
    const [low, a] = HEATMAP_COLOR_STOPS[stop];
    const [high, b] = HEATMAP_COLOR_STOPS[stop + 1];
    const ratio = (value - low) / (high - low);
    for (let channel = 0; channel < 3; channel++)
      output.data[index * 4 + channel] = Math.round(a[channel] + (b[channel] - a[channel]) * ratio);
    output.data[index * 4 + 3] = 255;
  }
  return output;
}

// Upload and live inspection use the same versioned recipe; old assets remain readable.
export const THERMAL_HEATMAP_ALGORITHM = {
  id: THERMAL_HEATMAP_ALGORITHM_ID,
  async render(before: ImageData, comparison: ImageData) {
    return renderHeatmap(analyzeHeatmap(before, comparison));
  },
};
