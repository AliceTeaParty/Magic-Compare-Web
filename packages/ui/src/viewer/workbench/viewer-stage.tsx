"use client";

import { PhotoLibrary } from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import { getContainedMediaRect } from "@magic-compare/compare-core";
import type { ViewerMode } from "@magic-compare/content-schema";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import { useEffect, useMemo, useRef, type ReactNode, type RefObject, useState } from "react";
import { ABCompareStage } from "./ab-compare-stage";
import { PositionedStageMedia } from "./positioned-stage-media";
import { SwipeCompareStage } from "./swipe-compare-stage";
import { viewerTokens } from "./viewer-tokens";
import {
  type ViewerInteractionStore,
  useViewerAbStageActive,
  useViewerOverlayOpacity,
} from "./viewer-interaction-store";

export { DEFAULT_PAN_ZOOM } from "./positioned-stage-media";

export interface ViewportSize {
  width: number;
  height: number;
}

export interface StageSize {
  width: number;
  height: number;
}

/**
 * Reads the live viewport instead of relying on CSS breakpoints because fit-to-screen math needs
 * pixel dimensions that exactly match the current browser window.
 */
export function getViewportSize(): ViewportSize {
  if (typeof window === "undefined") {
    return { width: 0, height: 0 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

/**
 * Normalizes device pixel ratio so pan/zoom math never drops below 1 on browsers that momentarily
 * report falsy DPR values during resize.
 */
export function getViewerDevicePixelRatio(): number {
  if (typeof window === "undefined") {
    return 1;
  }

  return Math.max(1, window.devicePixelRatio || 1);
}

/**
 * Tracks the rendered stage box rather than the viewport because contained-media math must follow
 * the actual component size after responsive layout and sidebar changes.
 */
function useElementSize(targetRef: RefObject<HTMLElement | null>): StageSize {
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });

  useEffect(() => {
    const target = targetRef.current;
    if (!target) {
      return;
    }

    /**
     * Re-reads from the ref on each callback so ResizeObserver and late ref swaps always measure
     * the current stage node instead of a stale element snapshot.
     */
    function syncSize() {
      const element = targetRef.current;
      if (!element) {
        return;
      }

      const nextWidth = element.clientWidth;
      const nextHeight = element.clientHeight;
      // ResizeObserver may repeat an unchanged measurement; retaining the same object prevents
      // redundant stage and full-size media renders without skipping real transition frames.
      setSize((currentSize) =>
        currentSize.width === nextWidth && currentSize.height === nextHeight
          ? currentSize
          : { width: nextWidth, height: nextHeight },
      );
    }

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef]);

  return size;
}

/**
 * Keeps the visual frame around the compare stage responsible only for sizing and chrome so each
 * mode can focus on its own interaction rules.
 */
function StagePresentationShell({
  children,
  inspectActive,
}: {
  children: ReactNode;
  inspectActive?: boolean;
}) {
  const activeStageShadow = `inset 0 0 0 1px ${viewerTokens.stage.activeBorder}, ${viewerTokens.stage.activeShadow}`;

  return (
    <Box
      sx={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100%",
        height: "100%",
        minWidth: 0,
        marginInline: "auto",
        // A real border reserved a dark one-pixel strip around every image and only changed color
        // while A/B was active. The inset ring now overlays the image without changing stage size,
        // keeping inactive edges identical across A/B, Swipe, and Heatmap.
        borderRadius: 1.5,
        overflow: "hidden",
        border: 0,
        background: viewerTokens.stage.surface,
        boxShadow: inspectActive ? activeStageShadow : viewerTokens.stage.measuredShadow,
        transition: "box-shadow 180ms cubic-bezier(0.2, 0, 0, 1)",
        "&:focus-within": {
          boxShadow: activeStageShadow,
        },
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Chooses the active stage implementation and computes the contained media rect from the currently
 * visible asset so all compare modes share the same fitted geometry.
 */
function ViewerStageContent({
  abSide,
  afterAsset,
  beforeAsset,
  devicePixelRatio,
  frameId,
  heatmapAsset,
  interactionStore,
  mode,
  onCycleAbSide,
  prefersReducedMotion,
  rotateStage,
}: {
  abSide: "before" | "after";
  afterAsset: ViewerAsset | undefined;
  beforeAsset: ViewerAsset | undefined;
  devicePixelRatio: number;
  frameId: string | undefined;
  heatmapAsset: ViewerAsset | undefined;
  interactionStore: ViewerInteractionStore;
  mode: ViewerMode;
  onCycleAbSide: () => void;
  prefersReducedMotion: boolean;
  rotateStage: boolean;
}) {
  const overlayOpacity = useViewerOverlayOpacity(interactionStore);
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const viewportSize = useElementSize(stageViewportRef);
  const referenceAsset = afterAsset ?? beforeAsset;
  const mediaRect = useMemo(() => {
    if (!referenceAsset) {
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };
    }

    const mediaSize = rotateStage
      ? { width: referenceAsset.height, height: referenceAsset.width }
      : { width: referenceAsset.width, height: referenceAsset.height };

    return getContainedMediaRect(viewportSize, mediaSize);
  }, [referenceAsset, rotateStage, viewportSize]);

  if (!beforeAsset || !afterAsset) {
    return (
      <Stack
        spacing={1.5}
        sx={{
          alignItems: "center",
        }}
      >
        <PhotoLibrary sx={{ color: "text.secondary" }} />
        <Typography variant="body1">This frame is missing its before/after pair.</Typography>
      </Stack>
    );
  }

  if (mode === "a-b") {
    return (
      <Box ref={stageViewportRef} sx={{ width: "100%", height: "100%", borderRadius: "inherit" }}>
        <ABCompareStage
          afterAsset={afterAsset}
          beforeAsset={beforeAsset}
          devicePixelRatio={devicePixelRatio}
          frameId={frameId}
          interactionStore={interactionStore}
          mediaRect={mediaRect}
          onCycleSide={onCycleAbSide}
          prefersReducedMotion={prefersReducedMotion}
          rotateStage={rotateStage}
          side={abSide}
          viewportSize={viewportSize}
        />
      </Box>
    );
  }

  if (mode === "heatmap" && heatmapAsset) {
    return (
      <Box
        ref={stageViewportRef}
        sx={{ width: "100%", height: "100%", position: "relative", borderRadius: "inherit" }}
      >
        <PositionedStageMedia
          asset={afterAsset}
          alt={`${afterAsset.label} base`}
          mediaRect={mediaRect}
          rotateStage={rotateStage}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          prefersReducedMotion={prefersReducedMotion}
        />
        <PositionedStageMedia
          asset={heatmapAsset}
          alt={heatmapAsset.label}
          mediaRect={mediaRect}
          rotateStage={rotateStage}
          loading="eager"
          decoding="async"
          fetchPriority="auto"
          opacity={overlayOpacity / 100}
          prefersReducedMotion={prefersReducedMotion}
        />
      </Box>
    );
  }

  return (
    <Box ref={stageViewportRef} sx={{ width: "100%", height: "100%", borderRadius: "inherit" }}>
      <SwipeCompareStage
        beforeAsset={beforeAsset}
        afterAsset={afterAsset}
        frameId={frameId}
        interactionStore={interactionStore}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
        prefersReducedMotion={prefersReducedMotion}
      />
    </Box>
  );
}

interface ViewerStageProps {
  abSide: "before" | "after";
  afterAsset: ViewerAsset | undefined;
  beforeAsset: ViewerAsset | undefined;
  devicePixelRatio: number;
  frameId: string | undefined;
  heatmapAsset: ViewerAsset | undefined;
  interactionStore: ViewerInteractionStore;
  mode: ViewerMode;
  onCycleAbSide: () => void;
  prefersReducedMotion: boolean;
  rotateStage: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
}

/**
 * Exposes one stable viewer-stage entry point so the workbench can swap modes without caring about
 * the layout and sizing details of the underlying interaction components.
 */
export function ViewerStage({
  abSide,
  afterAsset,
  beforeAsset,
  devicePixelRatio,
  frameId,
  heatmapAsset,
  interactionStore,
  mode,
  onCycleAbSide,
  prefersReducedMotion,
  rotateStage,
  stageRef,
}: ViewerStageProps) {
  const abStageActive = useViewerAbStageActive(interactionStore, frameId);
  return (
    <Box
      ref={stageRef}
      sx={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        display: "grid",
        placeItems: "center",
      }}
    >
      <StagePresentationShell inspectActive={mode === "a-b" && abStageActive}>
        <ViewerStageContent
          abSide={abSide}
          afterAsset={afterAsset}
          beforeAsset={beforeAsset}
          devicePixelRatio={devicePixelRatio}
          frameId={frameId}
          heatmapAsset={heatmapAsset}
          interactionStore={interactionStore}
          mode={mode}
          onCycleAbSide={onCycleAbSide}
          prefersReducedMotion={prefersReducedMotion}
          rotateStage={rotateStage}
        />
      </StagePresentationShell>
    </Box>
  );
}
