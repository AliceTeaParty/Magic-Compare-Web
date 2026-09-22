"use client";

import { Box, Collapse, Paper } from "@mui/material";
import {
  getComparisonAssetKey,
  getNextAbAssetSelection,
  getContainedMediaRect,
  getViewerPresetTransformScale,
  clampViewerPanZoom,
} from "@magic-compare/compare-core";
import { useViewerController } from "@magic-compare/compare-core/use-viewer-controller";
import type { ViewerDataset } from "@magic-compare/compare-core/viewer-data";
import { useCallback, useEffect, useState } from "react";
import { ViewerFilmstrip } from "./workbench/viewer-filmstrip";
import { ViewerHeader } from "./workbench/viewer-header";
import {
  useAbStageOutsideDismiss,
  useViewerKeyboardShortcuts,
  useViewerMediaPreferences,
  useViewerPreferencePersistence,
  useViewerDevicePixelRatio,
} from "./workbench/use-group-viewer-workbench-effects";
import { ViewerSidebar } from "./workbench/viewer-sidebar";
import { ViewerStage } from "./workbench/viewer-stage";
import { useViewerImagePreloader } from "./workbench/viewer-image-preloader";
import { useViewerStageShellState } from "./workbench/use-viewer-stage-shell-state";
import { viewerTokens } from "./workbench/viewer-tokens";
import { ViewerGuidePanel } from "./workbench/viewer-guide-panel";
import { readViewerGuideState, writeViewerGuideState } from "./workbench/viewer-guide-storage";
import { ViewerOnboardingNudge } from "./workbench/viewer-onboarding-nudge";
import { PixelRenderingAutoDisableNudge } from "./workbench/pixel-rendering-auto-disable-nudge";
import {
  useViewerAbStageActive,
  useViewerInteractionStore,
  useViewerPixelRenderingPromptOpen,
} from "./workbench/viewer-interaction-store";

import { useLiveHeatmap } from "./workbench/use-live-heatmap";
import {
  HeatmapInspectionPanel,
  HeatmapRegionMarkers,
  type HeatmapDisplay,
} from "./workbench/heatmap-inspection-panel";
import type { HeatmapRegion } from "@magic-compare/compare-core/heatmap";

interface GroupViewerWorkbenchProps {
  dataset: ViewerDataset;
  onGroupNavigate?: (href: string) => void;
  onGroupPrefetch?: (href: string) => void;
  pendingGroupHref?: string | null;
  variant: "public" | "internal";
}

/**
 * Composes the viewer shell around smaller workbench modules so layout, persistence, and keyboard
 * behavior stay centralized while rendering details live in focused subcomponents.
 */
export function GroupViewerWorkbench({
  dataset,
  onGroupNavigate,
  onGroupPrefetch,
  pendingGroupHref,
  variant,
}: GroupViewerWorkbenchProps) {
  // Public mobile navigation now occupies a real top app bar; subtracting its shared CSS variable
  // prevents the viewer plus footer from becoming one extra app-bar height taller than the screen.
  const viewportHeight =
    variant === "internal"
      ? "calc(100svh - 64px)"
      : "calc(100svh - var(--magic-public-app-bar-height, 0px))";
  const controller = useViewerController(dataset.group);
  const {
    abSide,
    afterAsset,
    availableModes,
    beforeAsset,
    closeSidebar,
    currentFrameIndex,
    currentFrame,
    comparisonAssetKey,
    comparisonAssets,
    frames,
    heatmapAsset,
    heatmapReferenceAsset,
    mode,
    selectFrame,
    setAbSide,
    setComparisonAssetKey,
    setMode,
    setSidebarOpen,
    sidebarOpen,
    stepFrame,
    toggleSidebar,
  } = controller;
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);
  const [guideOpen, setGuideOpen] = useState(false);
  const [showGuideNudge, setShowGuideNudge] = useState(false);
  const currentFrameId = currentFrame?.id;
  const interactionStore = useViewerInteractionStore(currentFrameId);
  const abStageActive = useViewerAbStageActive(interactionStore, currentFrameId);
  const pixelRenderingAutoDisablePromptOpen = useViewerPixelRenderingPromptOpen(interactionStore);
  const setAbStageActive = useCallback(
    (nextActive: boolean) => interactionStore.setStageActive(currentFrameId, nextActive),
    [currentFrameId, interactionStore],
  );
  const {
    mediaPreferencesReady,
    resolvedHideStageScrollControl,
    resolvedPrefersReducedMotion,
    resolvedRotateStage,
    resolvedShowDesktopSidebar,
  } = useViewerMediaPreferences();
  // Derive stage aspect ratio from the actual content dimensions so the stage frame matches the
  // image without pillarboxing or letterboxing.  Falls back to 16:9 while assets are loading.
  // Heatmap now follows the selected originals; a stored map is used only by explicit fallback.
  const activeAfterAsset = afterAsset;
  const [heatmapGain, setHeatmapGain] = useState(1);
  const [heatmapDisplay, setHeatmapDisplay] = useState<HeatmapDisplay>("map");
  const [heatmapRetry, setHeatmapRetry] = useState(0);
  const [storedHeatmapKey, setStoredHeatmapKey] = useState<string | null>(null);
  const heatmapPairKey = `${beforeAsset?.imageUrl}\n${afterAsset?.imageUrl}`;
  const useStoredHeatmap = storedHeatmapKey === heatmapPairKey;
  const liveHeatmap = useLiveHeatmap(
    mode === "heatmap" && !useStoredHeatmap,
    beforeAsset,
    afterAsset,
    heatmapGain,
    heatmapRetry,
  );
  const matchingStoredHeatmap =
    heatmapReferenceAsset?.id === afterAsset?.id ? heatmapAsset : undefined;
  const displayedHeatmap = useStoredHeatmap ? matchingStoredHeatmap : liveHeatmap.asset;
  const activeComparisonAssetKey = activeAfterAsset
    ? getComparisonAssetKey(activeAfterAsset)
    : comparisonAssetKey;
  const referenceAsset = activeAfterAsset ?? beforeAsset;
  const contentAspectRatio = referenceAsset ? referenceAsset.width / referenceAsset.height : 16 / 9;
  const stageShell = useViewerStageShellState({
    prefersReducedMotion: resolvedPrefersReducedMotion,
  });
  /** Jump from a ranked patch to the same original pixels in A/B, using the existing physical-pixel zoom model. */
  function inspectHeatmapRegion(region: HeatmapRegion) {
    const element = stageShell.stageRef.current;
    if (!element || !afterAsset) return;
    const viewport = element.getBoundingClientRect();
    const media = resolvedRotateStage
      ? { width: afterAsset.height, height: afterAsset.width }
      : afterAsset;
    const mediaRect = getContainedMediaRect(viewport, media);
    const scale = getViewerPresetTransformScale(3, {
      devicePixelRatio,
      media: afterAsset,
      mediaRect,
      rotateStage: resolvedRotateStage,
    });
    const sourceX = region.x + region.width / 2;
    const sourceY = region.y + region.height / 2;
    const centerX = resolvedRotateStage ? 1 - sourceY : sourceX;
    const centerY = resolvedRotateStage ? sourceX : sourceY;
    setMode("a-b");
    setAbSide("after");
    interactionStore.setPanZoomState(
      currentFrameId,
      clampViewerPanZoom(
        {
          presetScale: 3,
          fineScale: 1,
          x: (0.5 - centerX) * mediaRect.width * scale,
          y: (0.5 - centerY) * mediaRect.height * scale,
        },
        mediaRect,
        scale,
        viewport,
      ),
    );
    interactionStore.setStageActive(currentFrameId, true);
    // Removing the analysis panel moves the stage; measure its scroll target after that commit.
    requestAnimationFrame(() => stageShell.scrollStageIntoView());
  }

  const desktopStageOffset = variant === "internal" ? 100 : 36;
  const portraitStageOffset = variant === "internal" ? 88 : 80;
  const desktopStageMaxWidth = `calc(${contentAspectRatio * 100}svh - ${contentAspectRatio * desktopStageOffset}px)`;
  const portraitAspectRatio = 1 / contentAspectRatio;
  const portraitStageMaxWidth = `calc(${portraitAspectRatio * 100}svh - ${portraitAspectRatio * portraitStageOffset}px)`;
  const imagePreloader = useViewerImagePreloader({
    comparisonAssetKey: activeComparisonAssetKey,
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

  useEffect(() => {
    if (mediaPreferencesReady && !resolvedShowDesktopSidebar) {
      // A persisted desktop supporting pane must not become a blocking drawer on mobile entry.
      // This runs only when the responsive mode changes, so users can still open the drawer.
      closeSidebar();
    }
  }, [closeSidebar, mediaPreferencesReady, resolvedShowDesktopSidebar]);

  useViewerDevicePixelRatio(setDevicePixelRatio);

  useEffect(() => {
    setShowGuideNudge(readViewerGuideState() === null);
  }, []);

  /**
   * Restores the compare surface to its default inspection state so keyboard recovery and mode
   * switches share the same reset path after an accidental pan, zoom, or swipe move.
   */
  const resetViewerView = useCallback(() => {
    interactionStore.resetFrame(currentFrameId);
  }, [currentFrameId, interactionStore]);

  const disablePixelRenderingAutoEnable = useCallback(
    () => interactionStore.disablePixelRenderingAutoEnable(),
    [interactionStore],
  );
  const dismissPixelRenderingAutoPromptForSession = useCallback(
    () => interactionStore.dismissPixelRenderingAutoPromptForSession(),
    [interactionStore],
  );
  const keepPixelRenderingAutoEnable = useCallback(
    () => interactionStore.keepPixelRenderingAutoEnable(),
    [interactionStore],
  );

  /**
   * Opens the guide from explicit user intent; it remains replayable after first-run state is saved.
   */
  const openViewerGuide = useCallback(() => {
    setGuideOpen(true);
  }, []);

  /**
   * Persists a completed guide decision while keeping an in-memory fallback for blocked storage.
   */
  const completeViewerGuide = useCallback(() => {
    writeViewerGuideState("completed");
    setShowGuideNudge(false);
    setGuideOpen(false);
  }, []);

  /**
   * Persists a skip decision so the first-run prompt does not interrupt future inspections.
   */
  const dismissViewerGuideNudge = useCallback(() => {
    writeViewerGuideState("dismissed");
    setShowGuideNudge(false);
  }, []);

  const toggleViewerGuide = useCallback(() => {
    setGuideOpen((currentOpen) => !currentOpen);
  }, []);

  // A/B column order is reversible: ArrowDown follows Src → Rip → Flt and ArrowUp reverses it.
  // Click and Enter keep their established forward cycle by using the default direction.
  const cycleCurrentAbAsset = useCallback(
    (direction: 1 | -1 = 1) => {
      const nextSelection = getNextAbAssetSelection(
        { comparisonAssetKey, side: abSide },
        comparisonAssets,
        direction,
      );

      if (
        nextSelection.comparisonAssetKey &&
        nextSelection.comparisonAssetKey !== comparisonAssetKey
      ) {
        setComparisonAssetKey(nextSelection.comparisonAssetKey);
      }

      setAbSide(nextSelection.side);
    },
    [abSide, comparisonAssetKey, comparisonAssets, setAbSide, setComparisonAssetKey],
  );

  useViewerKeyboardShortcuts({
    abStageActive,
    cycleAbAsset: cycleCurrentAbAsset,
    mode,
    onResetView: resetViewerView,
    onToggleGuide: toggleViewerGuide,
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

  return (
    <Box
      sx={{
        // Public viewing is the same edge-to-edge workbench surface. The variant only accounts for
        // the internal app bar and controls which read-only metadata is exposed elsewhere.
        minHeight: viewportHeight,
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
              : "minmax(0, 1fr) 0px",
          // Keep both tracks so details can open and close continuously. The existing stage
          // ResizeObserver follows the interpolated width without remounting or reloading images.
          transition:
            "grid-template-columns 240ms cubic-bezier(0.2, 0, 0, 1), background-color 250ms cubic-bezier(0.2, 0, 0, 1)",
          "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          gridTemplateRows: "auto minmax(0, auto)",
          // A min-height grid stretches auto tracks by default, which made the viewer header absorb
          // the unused viewport height and pushed the stage far below its controls.
          alignContent: "start",
          minHeight: viewportHeight,
          overflow: "hidden",
          border: 0,
          borderRadius: 0,
          background: viewerTokens.workbench.panelSurface,
        }}
      >
        <ViewerHeader
          abSide={abSide}
          beforeAsset={beforeAsset}
          canUseHeatmap={availableModes.includes("heatmap")}
          caseTitle={dataset.caseMeta.title}
          comparisonAssetKey={activeComparisonAssetKey}
          comparisonAssets={comparisonAssets}
          frameId={currentFrameId}
          guideOpen={guideOpen}
          groupTitle={dataset.group.title}
          hideStageScrollControl={resolvedHideStageScrollControl}
          interactionStore={interactionStore}
          mode={mode}
          onAbSideChange={setAbSide}
          onComparisonAssetChange={setComparisonAssetKey}
          onOpenGuide={openViewerGuide}
          onModeChange={setMode}
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
          {/* Analysis controls change the stage's vertical position; collapse the reserved space
              along with the mode fade instead of jumping the image down and back up. */}
          <Collapse
            in={mode === "heatmap"}
            mountOnEnter
            unmountOnExit
            timeout={resolvedPrefersReducedMotion ? 0 : 240}
          >
            <HeatmapInspectionPanel
              state={liveHeatmap}
              gain={heatmapGain}
              onGainChange={setHeatmapGain}
              display={heatmapDisplay}
              onDisplayChange={setHeatmapDisplay}
              interactionStore={interactionStore}
              onInspect={inspectHeatmapRegion}
              stored={useStoredHeatmap}
              onRetry={() => {
                setStoredHeatmapKey(null);
                setHeatmapRetry((value) => value + 1);
              }}
              onUseStored={
                matchingStoredHeatmap ? () => setStoredHeatmapKey(heatmapPairKey) : undefined
              }
            />
          </Collapse>
          <Box data-testid="viewer-stage-area" sx={{ minWidth: 0, p: { xs: 1, md: 1.5 } }}>
            {/* Stack spacing reset the stage's auto margins, leaving fitted images left-aligned.
                One stage needs no spacing wrapper; its containing block owns centering. */}
            <Box
              sx={{
                position: "relative",
                minWidth: 0,
                // The old 140px server fallback expanded after hydration and caused a visible
                // layout shift. CSS now reserves the fitted stage geometry on the first paint.
                width: `min(100%, ${desktopStageMaxWidth})`,
                aspectRatio: contentAspectRatio,
                mx: "auto",
                "@media (max-width: 760px) and (orientation: portrait)": {
                  width: `min(100%, ${portraitStageMaxWidth})`,
                  aspectRatio: portraitAspectRatio,
                },
              }}
            >
              <ViewerStage
                abSide={abSide}
                afterAsset={activeAfterAsset}
                beforeAsset={beforeAsset}
                devicePixelRatio={devicePixelRatio}
                frameId={currentFrameId}
                heatmapAsset={displayedHeatmap}
                heatmapDisplay={heatmapDisplay}
                interactionStore={interactionStore}
                mode={mode}
                onCycleAbSide={cycleCurrentAbAsset}
                prefersReducedMotion={resolvedPrefersReducedMotion}
                rotateStage={resolvedRotateStage}
                stageRef={stageShell.stageRef}
              />
              {mode === "heatmap" &&
                !useStoredHeatmap &&
                heatmapDisplay !== "original" &&
                liveHeatmap.summary && (
                  <HeatmapRegionMarkers
                    regions={liveHeatmap.summary.regions}
                    rotate={resolvedRotateStage}
                    onInspect={inspectHeatmapRegion}
                  />
                )}
              {pixelRenderingAutoDisablePromptOpen ? (
                <Box
                  sx={{
                    position: "absolute",
                    zIndex: 2,
                    top: { xs: 8, md: 12 },
                    right: { xs: 8, md: 12 },
                  }}
                >
                  {/* This lightweight choice shares the guide nudge anchor so it cannot lock the
                        document scroll or shift the page when the browser scrollbar disappears. */}
                  <PixelRenderingAutoDisableNudge
                    onAutoClose={dismissPixelRenderingAutoPromptForSession}
                    onDisableAutoEnable={disablePixelRenderingAutoEnable}
                    onKeepAutoEnable={keepPixelRenderingAutoEnable}
                  />
                </Box>
              ) : showGuideNudge ? (
                <Box
                  sx={{
                    position: "absolute",
                    zIndex: 2,
                    top: { xs: 8, md: 12 },
                    right: { xs: 8, md: 12 },
                  }}
                >
                  {/* First-run guidance floats above the stage so appearing once cannot move the
                        image or filmstrip that operators use for repeated frame inspection. */}
                  <ViewerOnboardingNudge
                    onDismiss={dismissViewerGuideNudge}
                    onOpenGuide={openViewerGuide}
                  />
                </Box>
              ) : null}
            </Box>
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
          currentFrame={currentFrame}
          currentGroup={dataset.group}
          groups={dataset.siblingGroups}
          heatmapAsset={heatmapAsset}
          publishStatus={dataset.publishStatus}
          showDesktopSidebar={resolvedShowDesktopSidebar}
          sidebarOpen={sidebarOpen}
          closeSidebar={closeSidebar}
          prefersReducedMotion={resolvedPrefersReducedMotion}
          variant={variant}
          onGroupIntent={imagePreloader.preloadGroupHint}
          onGroupNavigate={onGroupNavigate}
          onGroupPrefetch={onGroupPrefetch}
          pendingGroupHref={pendingGroupHref}
        />
        <ViewerGuidePanel
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          onComplete={completeViewerGuide}
        />
      </Paper>
    </Box>
  );
}
