import {
  analyzeHeatmap,
  renderHeatmap,
  type HeatmapAnalysis,
} from "@magic-compare/compare-core/heatmap";

export type HeatmapSummary = Omit<HeatmapAnalysis, "intensity">;
export interface HeatmapRequest {
  id: number;
  gain: number;
  before?: ImageData;
  after?: ImageData;
}
export type HeatmapResponse =
  { id: number; blob: Blob; gain: number; summary: HeatmapSummary } | { id: number; error: string };
let analysis: HeatmapAnalysis | null = null;

/** Keep full-resolution analysis off the UI thread and retain it only for the active image pair. */
self.onmessage = async ({ data }: MessageEvent<HeatmapRequest>) => {
  try {
    if (data.before && data.after) analysis = analyzeHeatmap(data.before, data.after);
    if (!analysis) return;
    const pixels = renderHeatmap(analysis, data.gain);
    const canvas = new OffscreenCanvas(pixels.width, pixels.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建热图画布。");
    context.putImageData(pixels, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const { intensity: _intensity, ...summary } = analysis;
    self.postMessage({ id: data.id, blob, gain: data.gain, summary } satisfies HeatmapResponse);
  } catch (error) {
    self.postMessage({
      id: data.id,
      error:
        error instanceof Error
          ? error.message.includes("matching dimensions")
            ? "两张原图尺寸不一致，无法逐像素分析。"
            : error.message
          : "热图分析失败。",
    } satisfies HeatmapResponse);
  }
};
