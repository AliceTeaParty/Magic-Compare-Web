"use client";

import {
  getViewerDisplayedScale,
  normalizeViewerDisplayedScale,
  VIEWER_MAX_PRESET_SCALE,
  VIEWER_MIN_PRESET_SCALE,
  type ViewerPanZoomState,
} from "@magic-compare/compare-core";
import { clampNumber } from "@magic-compare/shared-utils";
import { useCallback, useMemo, useState } from "react";
import { DEFAULT_PAN_ZOOM } from "./positioned-stage-media";

/**
 * Keeps A/B inspect activation, pan/zoom, and toolbar scale changes behind one small state surface.
 */
export function useAbInspectState() {
  const [panZoomState, setPanZoomState] =
    useState<ViewerPanZoomState>(DEFAULT_PAN_ZOOM);
  const [stageActive, setStageActive] = useState(false);
  const displayedScale = useMemo(
    () => getViewerDisplayedScale(panZoomState),
    [panZoomState],
  );

  const reset = useCallback(() => {
    setPanZoomState(DEFAULT_PAN_ZOOM);
    setStageActive(false);
  }, []);

  const setScale = useCallback((nextScale: number) => {
    setPanZoomState((currentState) =>
      normalizeViewerDisplayedScale(
        clampNumber(
          nextScale,
          VIEWER_MIN_PRESET_SCALE,
          VIEWER_MAX_PRESET_SCALE,
        ),
        currentState,
      ),
    );
  }, []);

  return useMemo(
    () => ({
      displayedScale,
      panZoomState,
      reset,
      setPanZoomState,
      setScale,
      setStageActive,
      stageActive,
    }),
    [displayedScale, panZoomState, reset, setScale, stageActive],
  );
}
