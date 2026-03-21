"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  clampViewerPanZoom,
  getViewerEffectiveScale,
  getViewerPresetTransformScale,
  type ViewerMediaRect,
  type ViewerPanZoomState,
} from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";

/**
 * Centralizes scale calculation and clamping so every interaction path shares the same fitted-size
 * math and the exported hook does not have to repeat that bookkeeping.
 */
export function useStagePanZoomState({
  activeAsset,
  devicePixelRatio,
  mediaRect,
  panZoomState,
  rotateStage,
  setPanZoomState,
}: {
  activeAsset: ViewerAsset;
  devicePixelRatio: number;
  mediaRect: ViewerMediaRect;
  panZoomState: ViewerPanZoomState;
  rotateStage: boolean;
  setPanZoomState: (nextState: ViewerPanZoomState) => void;
}) {
  const scaleOptions = useMemo(
    () => ({
      devicePixelRatio,
      media: {
        width: activeAsset.width,
        height: activeAsset.height,
      },
      mediaRect,
      rotateStage,
    }),
    [
      activeAsset.height,
      activeAsset.width,
      devicePixelRatio,
      mediaRect,
      rotateStage,
    ],
  );
  const presetTransformScale = useMemo(
    () => getViewerPresetTransformScale(panZoomState.presetScale, scaleOptions),
    [panZoomState.presetScale, scaleOptions],
  );
  const effectiveScale = useMemo(
    () => getViewerEffectiveScale(panZoomState, scaleOptions),
    [panZoomState, scaleOptions],
  );

  useEffect(() => {
    setPanZoomState(
      clampViewerPanZoom(
        panZoomState,
        mediaRect,
        getViewerEffectiveScale(panZoomState, scaleOptions),
      ),
    );
  }, [mediaRect, panZoomState, scaleOptions, setPanZoomState]);

  /**
   * Reapplies the shared clamp rules so every gesture path respects the same pan bounds.
   */
  const applyPanZoom = useCallback(
    (nextState: ViewerPanZoomState) => {
      setPanZoomState(
        clampViewerPanZoom(
          nextState,
          mediaRect,
          getViewerEffectiveScale(nextState, scaleOptions),
        ),
      );
    },
    [mediaRect, scaleOptions, setPanZoomState],
  );

  return {
    effectiveScale,
    presetTransformScale,
    applyPanZoom,
  };
}
