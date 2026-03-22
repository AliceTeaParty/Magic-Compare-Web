"use client";

import { Tune } from "@mui/icons-material";
import { Box, Paper, Slider, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  VIEWER_MAX_PRESET_SCALE,
  VIEWER_MIN_PRESET_SCALE,
  cycleAbSide,
  getFittedStageSize as getViewerFittedStageSize,
} from "@magic-compare/compare-core";
import { useViewerController } from "@magic-compare/compare-core/use-viewer-controller";
import type { ViewerDataset } from "@magic-compare/compare-core/viewer-data";
import { clampNumber } from "@magic-compare/shared-utils";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  readViewerDetailsCookie,
  readViewerModeCookie,
  writeViewerDetailsCookie,
  writeViewerModeCookie,
} from "./workbench/viewer-cookies";
import { ViewerFilmstrip } from "./workbench/viewer-filmstrip";
import { ViewerHeader } from "./workbench/viewer-header";
import { ViewerSidebar } from "./workbench/viewer-sidebar";
import {
  DEFAULT_PAN_ZOOM,
  HeatmapNotice,
  ViewerStage,
  getViewerDevicePixelRatio,
  getViewportSignature,
  getViewportSize,
} from "./workbench/viewer-stage";

interface GroupViewerWorkbenchProps {
  dataset: ViewerDataset;
  variant: "public" | "internal";
}

/**
 * Composes the viewer shell around smaller workbench modules so layout, persistence, and keyboard
 * behavior stay centralized while rendering details live in focused subcomponents.
 */
export function GroupViewerWorkbench({
  dataset,
  variant,
}: GroupViewerWorkbenchProps) {
  const controller = useViewerController(dataset.group);
  const {
    abSide,
    afterAsset,
    availableModes,
    beforeAsset,
    closeSidebar,
    currentFrame,
    frames,
    heatmapAsset,
    mode,
    overlayOpacity,
    selectFrame,
    setAbSide,
    setMode,
    setOverlayOpacity,
    setSidebarOpen,
    sidebarOpen,
    stepFrame,
    toggleSidebar,
  } = controller;
  const sidebarPreferenceLoadedRef = useRef(false);
  const sidebarPreferencePersistReadyRef = useRef(false);
  const modePreferenceLoadedRef = useRef(false);
  const modePreferencePersistReadyRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();
  const showDesktopSidebar = useMediaQuery(theme.breakpoints.up("lg"), {
    noSsr: true,
  });
  const hideFitControl = useMediaQuery(theme.breakpoints.down("sm"), {
    noSsr: true,
  });
  const rotateStage = useMediaQuery(
    "(max-width: 760px) and (orientation: portrait)",
    {
      noSsr: true,
    },
  );
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
    { noSsr: true },
  );
  const [mediaPreferencesReady, setMediaPreferencesReady] = useState(false);
  const [viewportSize, setViewportSize] = useState(() => getViewportSize());
  const [devicePixelRatio, setDevicePixelRatio] = useState(() =>
    getViewerDevicePixelRatio(),
  );
  const [fitViewViewportSignature, setFitViewViewportSignature] = useState<
    string | null
  >(null);
  const [swipePosition, setSwipePosition] = useState(50);
  const [abPanZoomState, setAbPanZoomState] = useState(DEFAULT_PAN_ZOOM);
  const [abStageActive, setAbStageActive] = useState(false);
  const resolvedHideFitControl = mediaPreferencesReady ? hideFitControl : false;
  const resolvedPrefersReducedMotion = mediaPreferencesReady
    ? prefersReducedMotion
    : false;
  const resolvedRotateStage = mediaPreferencesReady ? rotateStage : false;
  const resolvedShowDesktopSidebar = mediaPreferencesReady
    ? showDesktopSidebar
    : false;
  const abSideRef = useRef(abSide);
  const abStageActiveRef = useRef(abStageActive);
  const modeRef = useRef(mode);
  const stageAspectRatio = resolvedRotateStage ? 9 / 16 : 16 / 9;
  const fittedStageSize = useMemo(
    () =>
      fitViewViewportSignature
        ? getViewerFittedStageSize(viewportSize, stageAspectRatio)
        : null,
    [fitViewViewportSignature, stageAspectRatio, viewportSize],
  );

  // Long-lived DOM listeners below must see fresh mode/inspect state without being torn down for
  // every render, because repeated resubscription was the source of the recent toggle regressions.
  abSideRef.current = abSide;
  abStageActiveRef.current = abStageActive;
  modeRef.current = mode;

  // Cookies are enough for these preferences; introducing server-backed settings would add more
  // machinery than the internal/public viewers currently need.
  useEffect(() => {
    const preferredOpenState = readViewerDetailsCookie();
    const preferredMode = readViewerModeCookie();

    if (preferredOpenState !== null) {
      setSidebarOpen(preferredOpenState);
    }

    if (preferredMode) {
      setMode(preferredMode);
    }

    sidebarPreferenceLoadedRef.current = true;
    modePreferenceLoadedRef.current = true;
  }, [setMode, setSidebarOpen]);

  // Server-rendered viewer pages need one hydration-stable pass before client media queries can
  // hide controls or rotate the stage, otherwise mobile first paint mismatches the static HTML.
  useEffect(() => {
    setMediaPreferencesReady(true);
  }, []);

  // Delay the first cookie write until after hydration so the existing preference can be read first.
  useEffect(() => {
    if (!sidebarPreferenceLoadedRef.current) {
      return;
    }

    if (!sidebarPreferencePersistReadyRef.current) {
      sidebarPreferencePersistReadyRef.current = true;
      return;
    }

    writeViewerDetailsCookie(sidebarOpen);
  }, [sidebarOpen]);

  // Mode persistence follows the same delayed-write rule as sidebar state for the same reason.
  useEffect(() => {
    if (!modePreferenceLoadedRef.current) {
      return;
    }

    if (!modePreferencePersistReadyRef.current) {
      modePreferencePersistReadyRef.current = true;
      return;
    }

    writeViewerModeCookie(mode);
  }, [mode]);

  // Pan/swipe state belongs to a single frame; carrying it over to another frame feels broken.
  useEffect(() => {
    setSwipePosition(50);
    setAbPanZoomState(DEFAULT_PAN_ZOOM);
    setAbStageActive(false);
  }, [currentFrame?.id]);

  // Leaving A/B mode should reset inspect state so returning to it starts from a predictable baseline.
  useEffect(() => {
    if (mode !== "a-b") {
      setAbPanZoomState(DEFAULT_PAN_ZOOM);
      setAbStageActive(false);
    }
  }, [mode]);

  // Fit calculations depend on live viewport geometry and device pixel ratio, not just CSS breakpoints.
  useEffect(() => {
    /**
     * Fit mode uses pixel-accurate stage math, so resize handling must refresh both CSS viewport
     * dimensions and device pixel ratio instead of trusting breakpoint-only changes.
     */
    function syncViewportMetrics() {
      setViewportSize(getViewportSize());
      setDevicePixelRatio(getViewerDevicePixelRatio());
    }

    syncViewportMetrics();
    window.addEventListener("resize", syncViewportMetrics);
    return () => window.removeEventListener("resize", syncViewportMetrics);
  }, []);

  // The DOM listener itself stays stable; refs provide fresh viewer state without reattaching it.
  useEffect(() => {
    /**
     * Keyboard shortcuts are attached once so rapid mode switching cannot accumulate duplicate
     * handlers, while refs keep the latest inspect state visible to the listener.
     */
    function handleKeydown(event: KeyboardEvent) {
      // Layer 1: Skip already-handled events and input composition to avoid duplicate processing
      // or interfering with IME (CJK input, etc.)
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      // Layer 2: Skip modifier key combinations to preserve system/browser shortcuts
      // (e.g., Ctrl+1 for browser zoom, Cmd+← for back, Alt+F for menu)
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      // Layer 3: Skip form inputs and content-editable regions to protect text editing
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          Boolean(event.target.closest('[contenteditable="true"]')) ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))
      ) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepFrame(1);
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepFrame(-1);
      }

      if (event.key === "1") {
        setMode("before-after");
      }

      if (event.key === "2") {
        setMode("a-b");
      }

      if (event.key === "3") {
        setMode("heatmap");
      }

      if (
        event.key === "Escape" &&
        modeRef.current === "a-b" &&
        abStageActiveRef.current
      ) {
        event.preventDefault();
        setAbStageActive(false);
      }

      if (
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        modeRef.current === "a-b" &&
        abStageActiveRef.current
      ) {
        event.preventDefault();
        setAbSide(cycleAbSide(abSideRef.current));
      }

      if (event.key.toLowerCase() === "i") {
        toggleSidebar();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [setAbSide, setMode, stepFrame, toggleSidebar]);

  // Only the active A/B state gates the listener; the callback already sees fresh controller state.
  useEffect(() => {
    if (mode !== "a-b" || !abStageActive) {
      return;
    }

    /**
     * Inspect mode exits only when the pointer lands outside the stage, which keeps taps inside
     * the canvas from collapsing A/B state on touch devices.
     */
    function handleOutsidePointerDown(event: PointerEvent) {
      const stageNode = stageRef.current;

      if (
        !stageNode ||
        !(event.target instanceof Node) ||
        stageNode.contains(event.target)
      ) {
        return;
      }

      setAbStageActive(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () =>
      document.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
        true,
      );
  }, [abStageActive, mode]);

  /**
   * Snaps preset zoom to the compare-core bounds so toolbar controls cannot drift from stage math.
   */
  function setAbScalePreset(nextPresetScale: number) {
    setAbPanZoomState(() => ({
      presetScale: clampNumber(
        nextPresetScale,
        VIEWER_MIN_PRESET_SCALE,
        VIEWER_MAX_PRESET_SCALE,
      ) as typeof DEFAULT_PAN_ZOOM.presetScale,
      fineScale: 1,
      x: 0,
      y: 0,
    }));
  }

  /**
   * Uses a viewport signature instead of a boolean so repeated clicks toggle fit off only for the
   * same viewport, while real viewport changes recompute the fitted size.
   */
  function toggleFittedStageView() {
    const nextViewportSize = getViewportSize();
    const nextSignature = getViewportSignature(nextViewportSize);

    setViewportSize(nextViewportSize);
    setFitViewViewportSignature((previousSignature) =>
      previousSignature && previousSignature === nextSignature
        ? null
        : nextSignature,
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100svh",
        px: { xs: 1.25, md: 2.5 },
        py: { xs: 1.25, md: 2.25 },
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 22%), transparent",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: "100%",
          display: "grid",
          gridTemplateColumns:
            sidebarOpen && resolvedShowDesktopSidebar
              ? "minmax(0, 1fr) 320px"
              : "1fr",
          gridTemplateRows: "auto minmax(0, 1fr)",
          minHeight: "calc(100svh - 16px)",
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          background:
            "linear-gradient(180deg, rgba(31, 51, 97, 0.94) 0%, rgba(12, 25, 56, 0.92) 100%)",
        }}
      >
        <ViewerHeader
          abPresetScale={abPanZoomState.presetScale}
          abSide={abSide}
          canUseHeatmap={availableModes.includes("heatmap")}
          caseTitle={dataset.caseMeta.title}
          groupTitle={dataset.group.title}
          hideFitControl={resolvedHideFitControl}
          isStageFitted={Boolean(fittedStageSize)}
          mode={mode}
          onAbSideChange={setAbSide}
          onModeChange={setMode}
          onScalePresetChange={setAbScalePreset}
          onToggleFit={toggleFittedStageView}
          onToggleSidebar={toggleSidebar}
          sidebarOpen={sidebarOpen}
        />

        <Box
          sx={{
            minWidth: 0,
            minHeight: 0,
            display: "grid",
            gridTemplateRows: "minmax(0, 1fr) auto",
          }}
        >
          <Box sx={{ minHeight: 0, p: { xs: 1.5, md: 2.25 } }}>
            <Stack
              spacing={1.5}
              sx={{
                width: "100%",
                minWidth: 0,
                height: "100%",
                minHeight: resolvedRotateStage
                  ? { xs: 520, md: 560 }
                  : { xs: 340, md: 460 },
              }}
            >
              {mode === "heatmap" && !heatmapAsset ? <HeatmapNotice /> : null}

              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: fittedStageSize
                    ? `${fittedStageSize.height}px`
                    : 0,
                }}
              >
                <ViewerStage
                  abSide={abSide}
                  abStageActive={abStageActive}
                  afterAsset={afterAsset}
                  beforeAsset={beforeAsset}
                  devicePixelRatio={devicePixelRatio}
                  fittedStageSize={fittedStageSize}
                  heatmapAsset={heatmapAsset}
                  mode={mode}
                  onCycleAbSide={() => setAbSide(cycleAbSide(abSide))}
                  overlayOpacity={overlayOpacity}
                  panZoomState={abPanZoomState}
                  rotateStage={resolvedRotateStage}
                  setAbStageActive={setAbStageActive}
                  setPanZoomState={setAbPanZoomState}
                  setSwipePosition={setSwipePosition}
                  stageRef={stageRef}
                  swipePosition={swipePosition}
                />
              </Box>

              {mode === "heatmap" && heatmapAsset ? (
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  alignItems="center"
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Tune fontSize="small" />
                    <Typography variant="body2">Opacity</Typography>
                  </Stack>
                  <Slider
                    min={20}
                    max={95}
                    value={overlayOpacity}
                    onChange={(_, value) =>
                      setOverlayOpacity(
                        clampNumber(
                          Array.isArray(value) ? value[0] : value,
                          20,
                          95,
                        ),
                      )
                    }
                    valueLabelDisplay="auto"
                    sx={{ maxWidth: 320 }}
                  />
                </Stack>
              ) : null}
            </Stack>
          </Box>

          <ViewerFilmstrip
            currentFrameId={currentFrame?.id}
            frames={frames}
            prefersReducedMotion={resolvedPrefersReducedMotion}
            onSelectFrame={selectFrame}
          />
        </Box>

        <ViewerSidebar
          caseMeta={dataset.caseMeta}
          currentFrame={currentFrame}
          currentGroup={dataset.group}
          groups={dataset.siblingGroups}
          heatmapAsset={heatmapAsset}
          publishStatus={dataset.publishStatus}
          showDesktopSidebar={resolvedShowDesktopSidebar}
          sidebarOpen={sidebarOpen}
          closeSidebar={closeSidebar}
          variant={variant}
        />
      </Paper>
    </Box>
  );
}
