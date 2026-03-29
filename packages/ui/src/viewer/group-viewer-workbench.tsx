"use client";

import { Tune } from "@mui/icons-material";
import { Box, Paper, Slider, Stack, Typography } from "@mui/material";
import {
  getViewerDisplayedScale,
  normalizeViewerDisplayedScale,
  VIEWER_MAX_PRESET_SCALE,
  VIEWER_MIN_PRESET_SCALE,
  cycleAbSide,
} from "@magic-compare/compare-core";
import { useViewerController } from "@magic-compare/compare-core/use-viewer-controller";
import type { ViewerDataset } from "@magic-compare/compare-core/viewer-data";
import { clampNumber } from "@magic-compare/shared-utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { ViewerFilmstrip } from "./workbench/viewer-filmstrip";
import { ViewerHeader } from "./workbench/viewer-header";
import {
  getViewerStageShellHeight,
  getViewerStageScrollPadding,
} from "./workbench/viewer-layout";
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
  const stageSlotRef = useRef<HTMLDivElement | null>(null);
  // Start from a zero viewport on the server and first client paint so hydration never bakes in a
  // stale desktop/mobile height budget before the real window metrics arrive.
  const [viewportSize, setViewportSize] = useState(() => ({
    width: 0,
    height: 0,
  }));
  const [stageSlotWidth, setStageSlotWidth] = useState(0);
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);
  const [swipePosition, setSwipePosition] = useState(50);
  const [abPanZoomState, setAbPanZoomState] = useState(DEFAULT_PAN_ZOOM);
  const [abStageActive, setAbStageActive] = useState(false);
  const [showAbInspectHint, setShowAbInspectHint] = useState(false);
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
  const stageShellHeight = useMemo(
    () =>
      getViewerStageShellHeight({
        viewportSize,
        availableWidth: stageSlotWidth,
        aspectRatio: stageAspectRatio,
      }),
    [stageAspectRatio, stageSlotWidth, viewportSize],
  );
  const abDisplayedScale = useMemo(
    () => getViewerDisplayedScale(abPanZoomState),
    [abPanZoomState],
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

  useEffect(() => {
    const stageSlotNode = stageSlotRef.current;
    if (!stageSlotNode) {
      return;
    }

    /**
     * Re-measures from the live ref so sidebar toggles and viewport resizes always update the
     * outer stage shell to the real width-constrained fit result instead of a stale width sample.
     */
    function syncStageSlotWidth() {
      const nextStageSlotNode = stageSlotRef.current;
      if (!nextStageSlotNode) {
        return;
      }

      setStageSlotWidth(nextStageSlotNode.clientWidth);
    }

    syncStageSlotWidth();
    const observer = new ResizeObserver(syncStageSlotWidth);
    observer.observe(stageSlotNode);
    return () => observer.disconnect();
  }, []);

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
    stageRef,
  });

  /**
   * Snaps preset zoom to the compare-core bounds so toolbar controls cannot drift from stage math.
   */
  function setAbScale(nextScale: number) {
    setAbPanZoomState((currentState) =>
      normalizeViewerDisplayedScale(
        clampNumber(
          nextScale,
          VIEWER_MIN_PRESET_SCALE,
          VIEWER_MAX_PRESET_SCALE,
        ),
        currentState,
      ),
    );
  }

  /**
   * Restores the compare surface to its default inspection state so keyboard recovery and mode
   * switches share the same reset path after an accidental pan, zoom, or swipe move.
   */
  function resetViewerView() {
    setSwipePosition(50);
    setAbPanZoomState(DEFAULT_PAN_ZOOM);
    setAbStageActive(false);
  }

  /**
   * Scrolls the compare surface into a screen-filling viewing position without changing its size,
   * which keeps the first screen free to show context while still offering a one-click jump.
   */
  function scrollStageIntoView() {
    const stageNode = stageRef.current;
    if (!stageNode || typeof window === "undefined") {
      return;
    }

    const nextViewportSize = getViewportSize();
    const scrollPadding = getViewerStageScrollPadding(nextViewportSize);
    const stageTop =
      window.scrollY + stageNode.getBoundingClientRect().top - scrollPadding;

    window.scrollTo({
      top: Math.max(0, stageTop),
      behavior: resolvedPrefersReducedMotion ? "auto" : "smooth",
    });
  }

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
          gridTemplateRows: "auto minmax(0, auto)",
          minHeight: {
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
          onScrollStageIntoView={scrollStageIntoView}
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
                ref={stageSlotRef}
                sx={{
                  position: "relative",
                  minWidth: 0,
                  // The viewport budget is only an upper bound. The outer shell must collapse to
                  // the fitted width-constrained stage height, or portrait mobile screens end up
                  // with a short stage vertically centered inside an overly tall empty slot.
                  height: `${stageShellHeight}px`,
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
                    border: "1px solid rgba(232, 198, 246, 0.28)",
                    backgroundColor: "rgba(5, 13, 34, 0.72)",
                    color: "text.secondary",
                    fontSize: "0.77rem",
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.18)",
                    transform: showAbInspectHint
                      ? "translate(-50%, 0)"
                      : "translate(-50%, -6px)",
                    opacity: showAbInspectHint ? 1 : 0,
                    transition:
                      "opacity 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                  Select the stage, then drag, scroll, or pinch. Press R to reset.
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
