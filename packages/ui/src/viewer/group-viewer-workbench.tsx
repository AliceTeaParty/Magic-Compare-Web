"use client";

import { Box, Paper, Stack } from "@mui/material";
import { cycleAbSide, getComparisonAssetKey } from "@magic-compare/compare-core";
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
  const activeAfterAsset = mode === "heatmap" ? heatmapReferenceAsset : afterAsset;
  const activeComparisonAssetKey = activeAfterAsset
    ? getComparisonAssetKey(activeAfterAsset)
    : comparisonAssetKey;
  const referenceAsset = activeAfterAsset ?? beforeAsset;
  const contentAspectRatio = referenceAsset ? referenceAsset.width / referenceAsset.height : 16 / 9;
  const stageShell = useViewerStageShellState({
    prefersReducedMotion: resolvedPrefersReducedMotion,
  });
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

  // Leaving A/B mode should reset inspect state so returning to it starts from a predictable baseline.
  useEffect(() => {
    if (mode !== "a-b") {
      interactionStore.resetAb(currentFrameId);
    }
  }, [currentFrameId, interactionStore, mode]);

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

  useViewerKeyboardShortcuts({
    abSide,
    abStageActive,
    mode,
    onResetView: resetViewerView,
    onToggleGuide: toggleViewerGuide,
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
            sidebarOpen && resolvedShowDesktopSidebar ? "minmax(0, 1fr) 320px" : "minmax(0, 1fr)",
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
          <Box sx={{ minWidth: 0, p: { xs: 1, md: 1.5 } }}>
            <Stack
              spacing={1.5}
              sx={{
                width: "100%",
                minWidth: 0,
                minHeight: 0,
              }}
            >
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
                  heatmapAsset={heatmapAsset}
                  interactionStore={interactionStore}
                  mode={mode}
                  onCycleAbSide={() => setAbSide(cycleAbSide(abSide))}
                  prefersReducedMotion={resolvedPrefersReducedMotion}
                  rotateStage={resolvedRotateStage}
                  stageRef={stageShell.stageRef}
                />
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
