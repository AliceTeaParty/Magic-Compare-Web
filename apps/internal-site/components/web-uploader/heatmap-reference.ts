import type { WebUploadAssetPlan, WebUploadFramePlan } from "./web-upload-types";

/** Returns comparison columns in their visible order while preserving the first unique label. */
export function getFrameComparisonAssets(frame: WebUploadFramePlan): WebUploadAssetPlan[] {
  const seenLabels = new Set<string>();
  return [frame.after, ...frame.misc].filter((asset) => {
    if (seenLabels.has(asset.label)) return false;
    seenLabels.add(asset.label);
    return true;
  });
}

/** Explicit heatmaps already carry their own pixels and do not constrain generated references. */
export function getFramesRequiringGeneratedHeatmap(frames: WebUploadFramePlan[]) {
  return frames.filter((frame) => !frame.heatmap);
}

/**
 * Keeps scanner validation, preview options, and generation on the same global-column rule so an
 * option accepted by the table cannot fail later while a frame is being generated.
 */
export function getCommonHeatmapReferenceLabels(frames: WebUploadFramePlan[]) {
  const generatedHeatmapFrames = getFramesRequiringGeneratedHeatmap(frames);
  if (generatedHeatmapFrames.length === 0) return [];

  const [firstFrame, ...remainingFrames] = generatedHeatmapFrames;
  const firstAssets = getFrameComparisonAssets(firstFrame);
  const commonLabels = new Set(firstAssets.map((asset) => asset.label));
  for (const frame of remainingFrames) {
    const labels = new Set(getFrameComparisonAssets(frame).map((asset) => asset.label));
    for (const label of commonLabels) {
      if (!labels.has(label)) commonLabels.delete(label);
    }
  }

  return firstAssets.map((asset) => asset.label).filter((label) => commonLabels.has(label));
}

export function getDefaultHeatmapReferenceLabel(frames: WebUploadFramePlan[]) {
  return getCommonHeatmapReferenceLabels(frames)[0] ?? "After";
}

export function resolveFrameHeatmapReference(
  frame: WebUploadFramePlan,
  referenceLabel: string,
): WebUploadAssetPlan | null {
  return getFrameComparisonAssets(frame).find((asset) => asset.label === referenceLabel) ?? null;
}
