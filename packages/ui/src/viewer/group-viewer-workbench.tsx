"use client";

import { Tune } from "@mui/icons-material";
import { Box, Paper, Slider, Stack, Typography } from "@mui/material";
import { cycleAbSide } from "@magic-compare/compare-core";
import { useViewerController } from "@magic-compare/compare-core/use-viewer-controller";
import type { ViewerDataset } from "@magic-compare/compare-core/viewer-data";
import { clampNumber } from "@magic-compare/shared-utils";
import { useCallback, useEffect, useState } from "react";
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
import { HeatmapNotice, ViewerStage } from "./workbench/viewer-stage";
import { useViewerImagePreloader } from "./workbench/viewer-image-preloader";
import { useAbInspectState } from "./workbench/use-ab-inspect-state";
import { useViewerStageShellState } from "./workbench/use-viewer-stage-shell-state";
import { viewerTokens } from "./workbench/viewer-tokens";

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
    currentFrameIndex,
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
  // Start from a zero viewport on the server and first client paint so hydration never bakes in a
  // stale desktop/mobile height budget before the real window metrics arrive.
  const [viewportSize, setViewportSize] = useState(() => ({
    width: 0,
    height: 0,
  }));
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);
  const [swipePosition, setSwipePosition] = useState(50);
  const [showAbInspectHint, setShowAbInspectHint] = useState(false);
  const abInspect = useAbInspectState();
  const {
    displayedScale: abDisplayedScale,
    panZoomState: abPanZoomState,
    reset: resetAbInspect,
    setPanZoomState: setAbPanZoomState,
    setScale: setAbScale,
    setStageActive: setAbStageActive,
    stageActive: abStageActive,
  } = abInspect;
  const {
    resolvedHideStageScrollControl,
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
  const stageShell = useViewerStageShellState({
    aspectRatio: stageAspectRatio,
    prefersReducedMotion: resolvedPrefersReducedMotion,
    viewportSize,
  });
  const imagePreloader = useViewerImagePreloader({
    currentFrameIndex,
    frames,
    mode,
  });

  useViewerPreferencePersistence({
    mode,
    setMode,
    setSidebarOpen,
    sidebarOpen,
  });

  // Pan/swipe state belongs to a single frame; carrying it over to another frame feels broken.
  useEffect(() => {
    setSwipePosition(50);
    resetAbInspect();
  }, [currentFrame?.id, resetAbInspect]);

  // Leaving A/B mode should reset inspect state so returning to it starts from a predictable baseline.
  useEffect(() => {
    if (mode !== "a-b") {
      resetAbInspect();
    }
  }, [mode, resetAbInspect]);

  useViewerViewportMetrics({
    setDevicePixelRatio,
    setViewportSize,
  });

  /**
   * Restores the compare surface to its default inspection state so keyboard recovery and mode
   * switches share the same reset path after an accidental pan, zoom, or swipe move.
   */
  const resetViewerView = useCallback(() => {
    setSwipePosition(50);
    resetAbInspect();
  }, [resetAbInspect]);

  useViewerKeyboardShortcuts({
    abSide,
    abStageActive,
    mode,
    onResetView: resetViewerView,
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
    stageRef: stageShell.stageRef,
  });

  useEffect(() => {
    if (mode !== "a-b" || typeof window === "undefined") {
      return;
    }

    const hintStorageKey = "magic-compare-ab-inspect-hint";

    try {
      if (window.sessionStorage.getItem(hintStorageKey) === "1") {
        return;
      }

      // This hint is intentionally brief and session-scoped so first-time users learn that A/B
      // inspect is interactive without adding persistent chrome once they already know the gesture.
      window.sessionStorage.setItem(hintStorageKey, "1");
    } catch {
      // Ignore storage errors; the fallback is simply showing the hint for this page load.
    }

    setShowAbInspectHint(true);
    const timeoutId = window.setTimeout(() => setShowAbInspectHint(false), 1000);
    return () => window.clearTimeout(timeoutId);
  }, [mode]);

  return (
    <Box
      sx={{
        minHeight: "100svh",
        px: { xs: 1.25, md: 2.5 },
        py: { xs: 1.25, md: 2.25 },
        background: viewerTokens.workbench.pageWash,
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
          gridTemplateRows: "auto minmax(0, auto)",
          minHeight: {
            xs: "calc(100svh - 20px)",
            md: "calc(100svh - 36px)",
          },
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          background: viewerTokens.workbench.panelSurface,
        }}
      >
        <ViewerHeader
          abScale={abDisplayedScale}
          abSide={abSide}
          canUseHeatmap={availableModes.includes("heatmap")}
          caseTitle={dataset.caseMeta.title}
          groupTitle={dataset.group.title}
          hideStageScrollControl={resolvedHideStageScrollControl}
          mode={mode}
          onAbSideChange={setAbSide}
          onModeChange={setMode}
          onScaleChange={setAbScale}
          onScrollStageIntoView={stageShell.scrollStageIntoView}
          onToggleSidebar={toggleSidebar}
          sidebarOpen={sidebarOpen}
        />

        <Box
          sx={{
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box sx={{ minWidth: 0, p: { xs: 1, md: 1.5 } }}>
            <Stack
              spacing={1.5}
              sx={{
                width: "100%",
                minWidth: 0,
                minHeight: 0,
              }}
            >
              {mode === "heatmap" && !heatmapAsset ? <HeatmapNotice /> : null}

              <Box
                ref={stageShell.stageSlotRef}
                sx={{
                  position: "relative",
                  minWidth: 0,
                  // The viewport budget is only an upper bound. The outer shell must collapse to
                  // the fitted width-constrained stage height, or portrait mobile screens end up
                  // with a short stage vertically centered inside an overly tall empty slot.
                  height: `${stageShell.shellHeight}px`,
                }}
              >
                <Box
                  aria-hidden={!showAbInspectHint}
                  sx={{
                    position: "absolute",
                    top: { xs: 10, md: 14 },
                    left: "50%",
                    zIndex: 1,
                    px: 1.3,
                    py: 0.65,
                    borderRadius: 999,
                    border: viewerTokens.workbench.hintBorder,
                    backgroundColor: viewerTokens.workbench.hintSurface,
                    color: "text.secondary",
                    fontSize: "0.77rem",
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    boxShadow: viewerTokens.workbench.hintShadow,
                    transform: showAbInspectHint
                      ? "translate(-50%, 0)"
                      : "translate(-50%, -6px)",
                    opacity: showAbInspectHint ? 1 : 0,
                    transition:
                      "opacity 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                  Click or press Enter/Space to inspect. Press R to reset.
                </Box>
                <ViewerStage
                  abSide={abSide}
                  abStageActive={abStageActive}
                  afterAsset={afterAsset}
                  beforeAsset={beforeAsset}
                  devicePixelRatio={devicePixelRatio}
                  heatmapAsset={heatmapAsset}
                  mode={mode}
                  onCycleAbSide={() => setAbSide(cycleAbSide(abSide))}
                  overlayOpacity={overlayOpacity}
                  panZoomState={abPanZoomState}
                  prefersReducedMotion={resolvedPrefersReducedMotion}
                  rotateStage={resolvedRotateStage}
                  setAbStageActive={setAbStageActive}
                  setPanZoomState={setAbPanZoomState}
                  setSwipePosition={setSwipePosition}
                  stageAspectRatio={stageAspectRatio}
                  stageRef={stageShell.stageRef}
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
            onFrameIntent={imagePreloader.preloadFrame}
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
          onGroupIntent={imagePreloader.preloadGroupHint}
        />
      </Paper>
    </Box>
  );
}
