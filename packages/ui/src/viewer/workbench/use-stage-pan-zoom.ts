"use client";

import type {
  ViewerMediaRect,
  ViewerPanZoomState,
} from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import { useStagePanZoomInteractions } from "./use-stage-pan-zoom-interactions";
import { useStagePanZoomState } from "./use-stage-pan-zoom-state";

/**
 * Manages A/B stage pan and pinch behavior so rotated portrait mode and desktop mode share the
 * same gesture rules.
 */
export function useStagePanZoom({
  active,
  activeAsset,
  devicePixelRatio,
  mediaRect,
  panZoomState,
  rotateStage,
  setPanZoomState,
}: {
  active: boolean;
  activeAsset: ViewerAsset;
  devicePixelRatio: number;
  mediaRect: ViewerMediaRect;
  panZoomState: ViewerPanZoomState;
  rotateStage: boolean;
  setPanZoomState: (nextState: ViewerPanZoomState) => void;
}) {
  const { effectiveScale, presetTransformScale, applyPanZoom } =
    useStagePanZoomState({
      activeAsset,
      devicePixelRatio,
      mediaRect,
      panZoomState,
      rotateStage,
      setPanZoomState,
    });
  const interactions = useStagePanZoomInteractions({
    active,
    applyPanZoom,
    effectiveScale,
    panZoomState,
    presetTransformScale,
  });

  return {
    effectiveScale,
    ...interactions,
  };
}
