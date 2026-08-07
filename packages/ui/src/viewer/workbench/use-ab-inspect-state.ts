"use client";

import {
  getViewerDisplayedScale,
  normalizeViewerDisplayedScale,
  VIEWER_MAX_PRESET_SCALE,
  VIEWER_MIN_PRESET_SCALE,
  type ViewerPanZoomState,
} from "@magic-compare/compare-core";
import { clampNumber } from "@magic-compare/shared-utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AB_PIXEL_RENDERING_AUTO_SCALE,
  shouldAutoEnableAbPixelRendering,
} from "./ab-pixel-rendering";
import { DEFAULT_PAN_ZOOM } from "./positioned-stage-media";
import {
  readViewerPixelRenderingAutoDisabledCookie,
  writeViewerPixelRenderingAutoDisabledCookie,
} from "./viewer-cookies";

/**
 * Keeps A/B inspect activation, pan/zoom, and toolbar scale changes behind one small state surface.
 */
export function useAbInspectState() {
  const [panZoomState, setPanZoomState] = useState<ViewerPanZoomState>(DEFAULT_PAN_ZOOM);
  // Sampling belongs to the mounted viewer session rather than one frame. Keeping it outside the
  // reset path preserves the explicit choice while frame changes still reset pan, zoom, and focus.
  const [pixelRenderingEnabled, setPixelRenderingEnabled] = useState(false);
  const pixelRenderingEnabledRef = useRef(false);
  // Start suppressed until hydration reads the cookie, preventing the static public viewer from
  // briefly overriding an existing manual opt-out at high zoom.
  const [pixelRenderingAutoEnableDisabled, setPixelRenderingAutoEnableDisabled] = useState(true);
  const pixelRenderingAutoEnableDisabledRef = useRef(true);
  const pixelRenderingAutoTriggerArmedRef = useRef(true);
  const pixelRenderingAutoPromptDismissedRef = useRef(false);
  const [pixelRenderingAutoDisablePromptOpen, setPixelRenderingAutoDisablePromptOpen] =
    useState(false);
  const [stageActive, setStageActive] = useState(false);
  const displayedScale = useMemo(() => getViewerDisplayedScale(panZoomState), [panZoomState]);

  useEffect(() => {
    const autoEnableDisabled = readViewerPixelRenderingAutoDisabledCookie();
    pixelRenderingAutoEnableDisabledRef.current = autoEnableDisabled;
    setPixelRenderingAutoEnableDisabled(autoEnableDisabled);
  }, []);

  useEffect(() => {
    if (displayedScale < AB_PIXEL_RENDERING_AUTO_SCALE) {
      pixelRenderingAutoTriggerArmedRef.current = true;
      return;
    }

    if (
      !shouldAutoEnableAbPixelRendering({
        autoEnableDisabled: pixelRenderingAutoEnableDisabled,
        autoTriggerArmed: pixelRenderingAutoTriggerArmedRef.current,
        displayedScale,
        pixelRenderingEnabled,
      })
    ) {
      return;
    }

    // The threshold changes sampling only; the existing pan/zoom object remains untouched so 250%
    // keeps the same physical-pixel scale and translation before and after automatic activation.
    pixelRenderingAutoTriggerArmedRef.current = false;
    pixelRenderingEnabledRef.current = true;
    setPixelRenderingEnabled(true);
  }, [displayedScale, pixelRenderingAutoEnableDisabled, pixelRenderingEnabled]);

  const reset = useCallback(() => {
    setPanZoomState(DEFAULT_PAN_ZOOM);
    setStageActive(false);
  }, []);

  const setScale = useCallback((nextScale: number) => {
    setPanZoomState((currentState) =>
      normalizeViewerDisplayedScale(
        clampNumber(nextScale, VIEWER_MIN_PRESET_SCALE, VIEWER_MAX_PRESET_SCALE),
        currentState,
      ),
    );
  }, []);

  const togglePixelRendering = useCallback(() => {
    const nextEnabled = !pixelRenderingEnabledRef.current;
    pixelRenderingEnabledRef.current = nextEnabled;
    setPixelRenderingEnabled(nextEnabled);

    if (nextEnabled && displayedScale >= AB_PIXEL_RENDERING_AUTO_SCALE) {
      pixelRenderingAutoTriggerArmedRef.current = false;
    }

    if (
      !nextEnabled &&
      !pixelRenderingAutoEnableDisabledRef.current &&
      !pixelRenderingAutoPromptDismissedRef.current
    ) {
      // Closing sampling and disabling future automation are separate decisions. The prompt keeps
      // a one-off manual close from silently becoming a year-long browser preference.
      setPixelRenderingAutoDisablePromptOpen(true);
    }
  }, [displayedScale]);

  const keepPixelRenderingAutoEnable = useCallback(() => {
    setPixelRenderingAutoDisablePromptOpen(false);
  }, []);

  const dismissPixelRenderingAutoPromptForSession = useCallback(() => {
    // A timed-out prompt should not repeatedly interrupt the same page session. This in-memory
    // marker intentionally resets on reload and does not alter the persistent automation choice.
    pixelRenderingAutoPromptDismissedRef.current = true;
    setPixelRenderingAutoDisablePromptOpen(false);
  }, []);

  const disablePixelRenderingAutoEnable = useCallback(() => {
    pixelRenderingAutoEnableDisabledRef.current = true;
    setPixelRenderingAutoEnableDisabled(true);
    setPixelRenderingAutoDisablePromptOpen(false);
    writeViewerPixelRenderingAutoDisabledCookie();
  }, []);

  return useMemo(
    () => ({
      displayedScale,
      disablePixelRenderingAutoEnable,
      dismissPixelRenderingAutoPromptForSession,
      keepPixelRenderingAutoEnable,
      panZoomState,
      pixelRenderingAutoDisablePromptOpen,
      pixelRenderingEnabled,
      reset,
      setPanZoomState,
      setScale,
      setStageActive,
      stageActive,
      togglePixelRendering,
    }),
    [
      displayedScale,
      disablePixelRenderingAutoEnable,
      dismissPixelRenderingAutoPromptForSession,
      keepPixelRenderingAutoEnable,
      panZoomState,
      pixelRenderingAutoDisablePromptOpen,
      pixelRenderingEnabled,
      reset,
      setScale,
      stageActive,
      togglePixelRendering,
    ],
  );
}
