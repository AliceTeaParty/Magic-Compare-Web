import type { ViewerMediaRect } from "@magic-compare/compare-core";
import { clampNumber } from "@magic-compare/shared-utils";

export interface SwipeCompareGeometry {
  axisLength: number;
  isVertical: boolean;
}

/** Keeps rotated-stage axis choice in one place so CSS movement and pointer math stay aligned. */
export function getSwipeCompareGeometry({
  mediaRect,
  rotateStage,
}: {
  mediaRect: ViewerMediaRect;
  rotateStage: boolean;
}): SwipeCompareGeometry {
  return {
    axisLength: rotateStage ? mediaRect.height : mediaRect.width,
    isVertical: rotateStage,
  };
}

/** Converts the committed swipe percentage into CSS values used by clip-path and transform. */
export function getSwipeCssValues({
  axisLength,
  position,
}: {
  axisLength: number;
  position: number;
}) {
  const clampedPosition = clampNumber(position, 0, 100);
  const ratio = clampedPosition / 100;

  return {
    offset: (axisLength * clampedPosition) / 100,
    position: clampedPosition,
    ratio,
  };
}

/**
 * Resolves pointer coordinates against the visible media box, switching to Y-axis math when the
 * mobile rotated stage presents the compare split vertically.
 */
export function resolveSwipePositionFromPointer({
  clientX,
  clientY,
  mediaRect,
  rotateStage,
  viewportRect,
}: {
  clientX: number;
  clientY: number;
  mediaRect: ViewerMediaRect;
  rotateStage: boolean;
  viewportRect: DOMRect;
}): number | null {
  if (rotateStage) {
    if (mediaRect.height <= 0) {
      return null;
    }

    const localY = clientY - viewportRect.top - mediaRect.y;
    return clampNumber((localY / mediaRect.height) * 100, 0, 100);
  }

  if (mediaRect.width <= 0) {
    return null;
  }

  const localX = clientX - viewportRect.left - mediaRect.x;
  return clampNumber((localX / mediaRect.width) * 100, 0, 100);
}
