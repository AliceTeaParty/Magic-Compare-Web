"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  clampViewerPanZoom,
  getViewerEffectiveScale,
  getViewerPresetTransformScale,
  type ViewerMediaRect,
  type ViewerPanZoomState,
  type ViewerStageSize,
} from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";

/**
 * Centralizes scale calculation and clamping so every interaction path shares the same fitted-size
 * math and the exported hook does not have to repeat that bookkeeping.
 */
export function useStagePanZoomState({
  activeAsset,
  clampViewport,
  devicePixelRatio,
  mediaRect,
  panZoomState,
  rotateStage,
  setPanZoomState,
}: {
  activeAsset: ViewerAsset;
  clampViewport: ViewerStageSize;
  devicePixelRatio: number;
  mediaRect: ViewerMediaRect;
  panZoomState: ViewerPanZoomState;
  rotateStage: boolean;
  setPanZoomState: (nextState: ViewerPanZoomState) => void;
}) {
  const panZoomStateRef = useRef(panZoomState);

  useEffect(() => {
    panZoomStateRef.current = panZoomState;
  }, [panZoomState]);

  function isSamePanZoomState(nextState: ViewerPanZoomState): boolean {
    const currentState = panZoomStateRef.current;
    return (
      currentState.presetScale === nextState.presetScale &&
      currentState.fineScale === nextState.fineScale &&
      currentState.x === nextState.x &&
      currentState.y === nextState.y
    );
  }

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
    const nextState = clampViewerPanZoom(
      panZoomState,
      mediaRect,
      getViewerEffectiveScale(panZoomState, scaleOptions),
      clampViewport,
    );

    if (!isSamePanZoomState(nextState)) {
      setPanZoomState(nextState);
    }
  }, [clampViewport, mediaRect, panZoomState, scaleOptions, setPanZoomState]);

  /**
   * Reapplies the shared clamp rules so every gesture path respects the same pan bounds.
   */
  const applyPanZoom = useCallback(
    (nextState: ViewerPanZoomState) => {
      const clampedNextState = clampViewerPanZoom(
        nextState,
        mediaRect,
        getViewerEffectiveScale(nextState, scaleOptions),
        clampViewport,
      );

      if (isSamePanZoomState(clampedNextState)) {
        return;
      }

      setPanZoomState(clampedNextState);
    },
    [clampViewport, mediaRect, scaleOptions, setPanZoomState],
  );

  return {
    effectiveScale,
    presetTransformScale,
    applyPanZoom,
  };
}
