import { orderByNumericOrder } from "@magic-compare/shared-utils";
import {
  findAsset,
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
export function buildFrameAssets(currentFrame: ViewerFrame | undefined): {
  afterAsset: ViewerAsset | undefined;
  beforeAsset: ViewerAsset | undefined;
  heatmapAsset: ViewerAsset | undefined;
} {
  if (!currentFrame) {
    return {
      beforeAsset: undefined,
      afterAsset: undefined,
      heatmapAsset: undefined,
    };
  }

  return {
    beforeAsset: findAsset(currentFrame, "before"),
    afterAsset: findAsset(currentFrame, "after"),
    heatmapAsset: findAsset(currentFrame, "heatmap"),
  };
}
