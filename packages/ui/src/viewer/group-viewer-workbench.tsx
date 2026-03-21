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
  const sidebarPreferenceLoadedRef = useRef(false);
  const sidebarPreferencePersistReadyRef = useRef(false);
  const modePreferenceLoadedRef = useRef(false);
  const modePreferencePersistReadyRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();
  const showDesktopSidebar = useMediaQuery(theme.breakpoints.up("lg"), { noSsr: true });
  const hideFitControl = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });
  const rotateStage = useMediaQuery("(max-width: 760px) and (orientation: portrait)", {
    noSsr: true,
  });
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true });
  const [viewportSize, setViewportSize] = useState(() => getViewportSize());
  const [devicePixelRatio, setDevicePixelRatio] = useState(() => getViewerDevicePixelRatio());
  const [fitViewViewportSignature, setFitViewViewportSignature] = useState<string | null>(null);
  const [swipePosition, setSwipePosition] = useState(50);
  const [abPanZoomState, setAbPanZoomState] = useState(DEFAULT_PAN_ZOOM);
  const [abStageActive, setAbStageActive] = useState(false);
  const stageAspectRatio = rotateStage ? 9 / 16 : 16 / 9;
  const fittedStageSize = useMemo(
    () =>
      fitViewViewportSignature ? getViewerFittedStageSize(viewportSize, stageAspectRatio) : null,
    [fitViewViewportSignature, stageAspectRatio, viewportSize],
  );

  // Cookies are enough for these preferences; introducing server-backed settings would add more
  // machinery than the internal/public viewers currently need.
  useEffect(() => {
    const preferredOpenState = readViewerDetailsCookie();
    const preferredMode = readViewerModeCookie();

    if (preferredOpenState !== null) {
      controller.setSidebarOpen(preferredOpenState);
    }

    if (preferredMode) {
      controller.setMode(preferredMode);
    }

    sidebarPreferenceLoadedRef.current = true;
    modePreferenceLoadedRef.current = true;
  }, [controller]);

  // Delay the first cookie write until after hydration so the existing preference can be read first.
  useEffect(() => {
    if (!sidebarPreferenceLoadedRef.current) {
      return;
    }

    if (!sidebarPreferencePersistReadyRef.current) {
      sidebarPreferencePersistReadyRef.current = true;
      return;
    }

    writeViewerDetailsCookie(controller.sidebarOpen);
  }, [controller.sidebarOpen]);

  // Mode persistence follows the same delayed-write rule as sidebar state for the same reason.
  useEffect(() => {
    if (!modePreferenceLoadedRef.current) {
      return;
    }

    if (!modePreferencePersistReadyRef.current) {
      modePreferencePersistReadyRef.current = true;
      return;
    }

    writeViewerModeCookie(controller.mode);
  }, [controller.mode]);

  // Pan/swipe state belongs to a single frame; carrying it over to another frame feels broken.
  useEffect(() => {
    setSwipePosition(50);
    setAbPanZoomState(DEFAULT_PAN_ZOOM);
    setAbStageActive(false);
  }, [controller.currentFrame?.id]);

  // Leaving A/B mode should reset inspect state so returning to it starts from a predictable baseline.
  useEffect(() => {
    if (controller.mode !== "a-b") {
      setAbPanZoomState(DEFAULT_PAN_ZOOM);
      setAbStageActive(false);
    }
  }, [controller.mode]);

  // Fit calculations depend on live viewport geometry and device pixel ratio, not just CSS breakpoints.
  useEffect(() => {
    function syncViewportMetrics() {
      setViewportSize(getViewportSize());
      setDevicePixelRatio(getViewerDevicePixelRatio());
    }

    syncViewportMetrics();
    window.addEventListener("resize", syncViewportMetrics);
    return () => window.removeEventListener("resize", syncViewportMetrics);
  }, []);

  // Keyboard shortcuts stay here so they remain consistent regardless of which compare mode is mounted.
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
      ) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        controller.stepFrame(1);
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        controller.stepFrame(-1);
      }

      if (event.key === "1") {
        controller.setMode("before-after");
      }

      if (event.key === "2") {
        controller.setMode("a-b");
      }

      if (event.key === "3") {
        controller.setMode("heatmap");
      }

      if (event.key === "Escape" && controller.mode === "a-b" && abStageActive) {
        event.preventDefault();
        setAbStageActive(false);
      }

      if (
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        controller.mode === "a-b" &&
        abStageActive
      ) {
        event.preventDefault();
        controller.setAbSide(cycleAbSide(controller.abSide));
      }

      if (event.key.toLowerCase() === "i") {
        controller.toggleSidebar();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [abStageActive, controller]);

  // Tapping outside the A/B stage exits inspect mode without requiring extra on-screen chrome.
  useEffect(() => {
    if (controller.mode !== "a-b" || !abStageActive) {
      return;
    }

    function handleOutsidePointerDown(event: PointerEvent) {
      const stageNode = stageRef.current;

      if (!stageNode || !(event.target instanceof Node) || stageNode.contains(event.target)) {
        return;
      }

      setAbStageActive(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, [abStageActive, controller.mode]);

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
      previousSignature && previousSignature === nextSignature ? null : nextSignature,
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
            controller.sidebarOpen && showDesktopSidebar ? "minmax(0, 1fr) 320px" : "1fr",
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
          abSide={controller.abSide}
          canUseHeatmap={controller.availableModes.includes("heatmap")}
          caseTitle={dataset.caseMeta.title}
          groupTitle={dataset.group.title}
          hideFitControl={hideFitControl}
          isStageFitted={Boolean(fittedStageSize)}
          mode={controller.mode}
          onAbSideChange={controller.setAbSide}
          onModeChange={controller.setMode}
          onScalePresetChange={setAbScalePreset}
          onToggleFit={toggleFittedStageView}
          onToggleSidebar={controller.toggleSidebar}
          sidebarOpen={controller.sidebarOpen}
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
                minHeight: rotateStage ? { xs: 520, md: 560 } : { xs: 340, md: 460 },
              }}
            >
              {controller.mode === "heatmap" && !controller.heatmapAsset ? <HeatmapNotice /> : null}

              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: fittedStageSize ? `${fittedStageSize.height}px` : 0,
                }}
              >
                <ViewerStage
                  abSide={controller.abSide}
                  abStageActive={abStageActive}
                  afterAsset={controller.afterAsset}
                  beforeAsset={controller.beforeAsset}
                  devicePixelRatio={devicePixelRatio}
                  fittedStageSize={fittedStageSize}
                  heatmapAsset={controller.heatmapAsset}
                  mode={controller.mode}
                  onCycleAbSide={() => controller.setAbSide(cycleAbSide(controller.abSide))}
                  overlayOpacity={controller.overlayOpacity}
                  panZoomState={abPanZoomState}
                  rotateStage={rotateStage}
                  setAbStageActive={setAbStageActive}
                  setPanZoomState={setAbPanZoomState}
                  setSwipePosition={setSwipePosition}
                  stageRef={stageRef}
                  swipePosition={swipePosition}
                />
              </Box>

              {controller.mode === "heatmap" && controller.heatmapAsset ? (
                <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Tune fontSize="small" />
                    <Typography variant="body2">Opacity</Typography>
                  </Stack>
                  <Slider
                    min={20}
                    max={95}
                    value={controller.overlayOpacity}
                    onChange={(_, value) =>
                      controller.setOverlayOpacity(
                        clampNumber(Array.isArray(value) ? value[0] : value, 20, 95),
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
            currentFrameId={controller.currentFrame?.id}
            frames={controller.frames}
            prefersReducedMotion={prefersReducedMotion}
            onSelectFrame={controller.selectFrame}
          />
        </Box>

        <ViewerSidebar
          caseMeta={dataset.caseMeta}
          currentFrame={controller.currentFrame}
          currentGroup={dataset.group}
          groups={dataset.siblingGroups}
          heatmapAsset={controller.heatmapAsset}
          publishStatus={dataset.publishStatus}
          showDesktopSidebar={showDesktopSidebar}
          sidebarOpen={controller.sidebarOpen}
          toggleSidebar={controller.toggleSidebar}
          variant={variant}
        />
      </Paper>
    </Box>
  );
}
