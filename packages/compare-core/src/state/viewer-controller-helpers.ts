import { orderByNumericOrder } from "@magic-compare/shared-utils";
import {
  findAsset,
  getAvailableModes,
  type ViewerAsset,
  type ViewerFrame,
  type ViewerGroup,
} from "../utils/viewer-data";

export function getOrderedFrames(group: ViewerGroup): ViewerFrame[] {
  return orderByNumericOrder(group.frames);
}

export function resolveFrameId(
  frames: ViewerFrame[],
  currentFrameId: string | undefined,
): string | undefined {
  if (!currentFrameId || !frames.some((frame) => frame.id === currentFrameId)) {
    return frames[0]?.id;
  }

  return currentFrameId;
}

export function buildFrameState(
  frames: ViewerFrame[],
  currentFrameId: string | undefined,
): {
  availableModes: ReturnType<typeof getAvailableModes>;
  currentFrame: ViewerFrame | undefined;
  currentFrameIndex: number;
} {
  const currentFrame = frames.find((frame) => frame.id === currentFrameId) ?? frames[0];
  const currentFrameIndex = currentFrame
    ? frames.findIndex((frame) => frame.id === currentFrame.id)
    : -1;

  return {
    currentFrame,
    currentFrameIndex,
    availableModes: currentFrame ? getAvailableModes(currentFrame) : ["before-after"],
  };
}

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
