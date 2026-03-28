"use client";

import { Tune } from "@mui/icons-material";
import { Box, Paper, Slider, Stack, Typography } from "@mui/material";
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
import { ViewerFilmstrip } from "./workbench/viewer-filmstrip";
import { ViewerHeader } from "./workbench/viewer-header";
import {
  useAbStageOutsideDismiss,
  useViewerKeyboardShortcuts,
  useViewerMediaPreferences,
  useViewerPreferencePersistence,
  useViewerViewportMetrics,
} from "./workbench/use-group-viewer-workbench-effects";
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
  const stageRef = useRef<HTMLDivElement | null>(null);
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
  const {
    resolvedHideFitControl,
    resolvedPrefersReducedMotion,
    resolvedRotateStage,
    resolvedShowDesktopSidebar,
  } = useViewerMediaPreferences();
  // Derive stage aspect ratio from the actual content dimensions so the stage frame matches the
  // image without pillarboxing or letterboxing.  Falls back to 16:9 while assets are loading.
  const referenceAsset = afterAsset ?? beforeAsset;
  const contentAspectRatio = referenceAsset
    ? referenceAsset.width / referenceAsset.height
    : 16 / 9;
  const stageAspectRatio = resolvedRotateStage
    ? 1 / contentAspectRatio
    : contentAspectRatio;
  const fittedStageSize = useMemo(
    () =>
      fitViewViewportSignature
        ? getViewerFittedStageSize(viewportSize, stageAspectRatio)
        : null,
    [fitViewViewportSignature, stageAspectRatio, viewportSize],
  );

  useViewerPreferencePersistence({
    mode,
    setMode,
    setSidebarOpen,
    sidebarOpen,
  });

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

  useViewerViewportMetrics({
    setDevicePixelRatio,
    setViewportSize,
  });
  useViewerKeyboardShortcuts({
    abSide,
    abStageActive,
    mode,
    setAbSide,
    setAbStageActive,
    setMode,
    stepFrame,
    toggleSidebar,
  });
  useAbStageOutsideDismiss({
    abStageActive,
    mode,
    setAbStageActive,
    stageRef,
  });

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
          height: {
            xs: "calc(100svh - 20px)",
            md: "calc(100svh - 36px)",
          },
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
            height: "100%",
            display: "grid",
            gridTemplateRows: "minmax(0, 1fr) auto",
          }}
        >
          <Box sx={{ minHeight: 0, height: "100%", p: { xs: 1.5, md: 2.25 } }}>
            <Stack
              spacing={1.5}
              sx={{
                width: "100%",
                minWidth: 0,
                height: "100%",
                minHeight: 0,
              }}
            >
              {mode === "heatmap" && !heatmapAsset ? <HeatmapNotice /> : null}

              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  height: "100%",
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
                  stageAspectRatio={stageAspectRatio}
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
