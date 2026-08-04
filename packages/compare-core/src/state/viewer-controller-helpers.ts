import { orderByNumericOrder } from "@magic-compare/shared-utils";
import {
  findAsset,
  getComparisonAssetKey,
  getComparisonTargetAssets,
  getAvailableModes,
  type ViewerAsset,
  type ViewerFrame,
  type ViewerGroup,
} from "../utils/viewer-data";

/**
 * Centralizes frame ordering so every viewer surface uses the same sequence instead of relying on
 * callers to remember the storage-level sort rule.
 */
export function getOrderedFrames(group: ViewerGroup): ViewerFrame[] {
  return orderByNumericOrder(group.frames);
}

/**
 * Falls back to the first frame whenever the current selection disappeared, which keeps the viewer
 * usable after filtering/import changes without preserving a dead frame id in state.
 */
export function resolveFrameId(
  frames: ViewerFrame[],
  currentFrameId: string | undefined,
): string | undefined {
  if (!currentFrameId || !frames.some((frame) => frame.id === currentFrameId)) {
    return frames[0]?.id;
  }

  return currentFrameId;
}

/**
 * Builds the frame-centric slice of viewer state in one place so hooks and components agree on
 * what "current frame" means when the saved id is missing.
 */
export function buildFrameState(
  frames: ViewerFrame[],
  currentFrameId: string | undefined,
): {
  availableModes: ReturnType<typeof getAvailableModes>;
  currentFrame: ViewerFrame | undefined;
  currentFrameIndex: number;
} {
  const currentFrame =
    frames.find((frame) => frame.id === currentFrameId) ?? frames[0];
  const currentFrameIndex = currentFrame
    ? frames.findIndex((frame) => frame.id === currentFrame.id)
    : -1;

  return {
    currentFrame,
    currentFrameIndex,
    availableModes: currentFrame
      ? getAvailableModes(currentFrame)
      : ["before-after"],
  };
}

/**
 * Resolves the assets the viewer panes care about and hides the raw `findAsset` lookups from the
 * state hook so the hook can stay focused on selection rules.
 */
export function buildFrameAssets(
  currentFrame: ViewerFrame | undefined,
  preferredComparisonAssetKey?: string,
): {
  afterAsset: ViewerAsset | undefined;
  beforeAsset: ViewerAsset | undefined;
  comparisonAssets: ViewerAsset[];
  heatmapReferenceAsset: ViewerAsset | undefined;
  heatmapAsset: ViewerAsset | undefined;
} {
  if (!currentFrame) {
    return {
      beforeAsset: undefined,
      afterAsset: undefined,
      comparisonAssets: [],
      heatmapReferenceAsset: undefined,
      heatmapAsset: undefined,
    };
  }

  const comparisonAssets = getComparisonTargetAssets(currentFrame);
  const primaryAfterAsset = findAsset(currentFrame, "after") ?? comparisonAssets[0];
  const afterAsset =
    comparisonAssets.find(
      (asset) => getComparisonAssetKey(asset) === preferredComparisonAssetKey,
    ) ?? primaryAfterAsset;
  const heatmapAsset = findAsset(currentFrame, "heatmap");

  // Browser-generated heatmaps record the source filename in their note. Match that reference
  // back to the uploaded column so selecting another comparison target cannot mislabel the overlay.
  const heatmapReferencePath = heatmapAsset?.note.includes(" vs ")
    ? heatmapAsset.note.split(" vs ").at(-1)
    : undefined;
  const heatmapReferenceAsset =
    comparisonAssets.find(
      (asset) =>
        Boolean(heatmapReferencePath) &&
        Boolean(asset.note) &&
        heatmapReferencePath?.endsWith(asset.note),
    ) ?? primaryAfterAsset;

  return {
    beforeAsset: findAsset(currentFrame, "before"),
    afterAsset,
    comparisonAssets,
    heatmapReferenceAsset,
    heatmapAsset,
  };
}
