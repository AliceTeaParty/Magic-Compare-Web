"use client";

import { PhotoLibrary } from "@mui/icons-material";
import { Alert, Box, Stack, Typography } from "@mui/material";
import {
  getContainedMediaRect,
  getFittedStageSize,
  type ViewerPanZoomState,
} from "@magic-compare/compare-core";
import type { ViewerMode } from "@magic-compare/content-schema";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
  useState,
} from "react";
import { ABCompareStage } from "./ab-compare-stage";
import { PositionedStageMedia } from "./positioned-stage-media";
import { SwipeCompareStage } from "./swipe-compare-stage";

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

      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
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
  stageSize,
  inspectActive,
  stageAspectRatio,
}: {
  children: ReactNode;
  stageSize: StageSize | null;
  inspectActive?: boolean;
  stageAspectRatio: number;
}) {
  const hasMeasuredStageSize = Boolean(stageSize);

  return (
    <Box
      sx={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: stageSize ? `${stageSize.width}px` : "100%",
        height: stageSize ? `${stageSize.height}px` : "100%",
        maxWidth: "100%",
        maxHeight: "100%",
        minWidth: 0,
        aspectRatio: hasMeasuredStageSize ? undefined : stageAspectRatio,
        minHeight: hasMeasuredStageSize ? 0 : { xs: 80 },
        marginInline: "auto",
        borderRadius: 2.5,
        overflow: "hidden",
        border: "1px solid",
        borderColor: inspectActive
          ? "rgba(232, 198, 246, 0.42)"
          : hasMeasuredStageSize
            ? "rgba(232, 198, 246, 0.36)"
            : "divider",
        background:
          "radial-gradient(circle at top, rgba(232, 198, 246, 0.1), transparent 28%), rgba(13, 24, 54, 0.94)",
        boxShadow: inspectActive
          ? "0 0 0 1px rgba(232, 198, 246, 0.08), 0 18px 44px rgba(8, 15, 35, 0.28)"
          : hasMeasuredStageSize
            ? "0 24px 52px rgba(8, 15, 35, 0.28)"
            : "none",
        transition:
          "width 180ms cubic-bezier(0.22, 1, 0.36, 1), height 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Explains the forced mode fallback when a frame lacks heatmap assets, which would otherwise look
 * like a broken blank panel.
 */
export function HeatmapNotice() {
  return (
    <Alert
      severity="info"
      sx={{
        borderRadius: 2.5,
        bgcolor: "rgba(232, 198, 246, 0.12)",
        color: "text.primary",
      }}
    >
      No heatmap for this frame. Viewer has fallen back to a primary compare
      mode.
    </Alert>
  );
}

/**
 * Chooses the active stage implementation and computes the contained media rect from the currently
 * visible asset so all compare modes share the same fitted geometry.
 */
function ViewerStageContent({
  abSide,
  abStageActive,
  afterAsset,
  beforeAsset,
  devicePixelRatio,
  heatmapAsset,
  mode,
  onCycleAbSide,
  overlayOpacity,
  panZoomState,
  rotateStage,
  setAbStageActive,
  setPanZoomState,
  setSwipePosition,
  swipePosition,
}: {
  abSide: "before" | "after";
  abStageActive: boolean;
  afterAsset: ViewerAsset | undefined;
  beforeAsset: ViewerAsset | undefined;
  devicePixelRatio: number;
  heatmapAsset: ViewerAsset | undefined;
  mode: ViewerMode;
  onCycleAbSide: () => void;
  overlayOpacity: number;
  panZoomState: ViewerPanZoomState;
  rotateStage: boolean;
  setAbStageActive: (nextActive: boolean) => void;
  setPanZoomState: (nextState: ViewerPanZoomState) => void;
  setSwipePosition: (value: number) => void;
  swipePosition: number;
}) {
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
      <Stack spacing={1.5} alignItems="center">
        <PhotoLibrary sx={{ color: "text.secondary" }} />
        <Typography variant="body1">
          This frame is missing its before/after pair.
        </Typography>
      </Stack>
    );
  }

  if (mode === "a-b") {
    const visibleAsset = abSide === "before" ? beforeAsset : afterAsset;
    return (
      <Box ref={stageViewportRef} sx={{ width: "100%", height: "100%" }}>
        <ABCompareStage
          active={abStageActive}
          activeAsset={visibleAsset}
          devicePixelRatio={devicePixelRatio}
          mediaRect={mediaRect}
          onCycleSide={onCycleAbSide}
          panZoomState={panZoomState}
          rotateStage={rotateStage}
          setActive={setAbStageActive}
          setPanZoomState={setPanZoomState}
          viewportSize={viewportSize}
        />
      </Box>
    );
  }

  if (mode === "heatmap" && heatmapAsset) {
    return (
      <Box
        ref={stageViewportRef}
        sx={{ width: "100%", height: "100%", position: "relative" }}
      >
        <PositionedStageMedia
          asset={afterAsset}
          alt={`${afterAsset.label} base`}
          mediaRect={mediaRect}
          rotateStage={rotateStage}
        />
        <PositionedStageMedia
          asset={heatmapAsset}
          alt={heatmapAsset.label}
          mediaRect={mediaRect}
          rotateStage={rotateStage}
          opacity={overlayOpacity / 100}
        />
      </Box>
    );
  }

  return (
    <Box ref={stageViewportRef} sx={{ width: "100%", height: "100%" }}>
      <SwipeCompareStage
        beforeAsset={beforeAsset}
        afterAsset={afterAsset}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
        setSwipePosition={setSwipePosition}
        swipePosition={swipePosition}
      />
    </Box>
  );
}

interface ViewerStageProps {
  abSide: "before" | "after";
  abStageActive: boolean;
  afterAsset: ViewerAsset | undefined;
  beforeAsset: ViewerAsset | undefined;
  devicePixelRatio: number;
  heatmapAsset: ViewerAsset | undefined;
  mode: ViewerMode;
  onCycleAbSide: () => void;
  overlayOpacity: number;
  panZoomState: ViewerPanZoomState;
  rotateStage: boolean;
  setAbStageActive: (nextActive: boolean) => void;
  setPanZoomState: (nextState: ViewerPanZoomState) => void;
  setSwipePosition: (value: number) => void;
  stageAspectRatio: number;
  stageRef: RefObject<HTMLDivElement | null>;
  swipePosition: number;
}

/**
 * Exposes one stable viewer-stage entry point so the workbench can swap modes without caring about
 * the layout and sizing details of the underlying interaction components.
 */
export function ViewerStage({
  abSide,
  abStageActive,
  afterAsset,
  beforeAsset,
  devicePixelRatio,
  heatmapAsset,
  mode,
  onCycleAbSide,
  overlayOpacity,
  panZoomState,
  rotateStage,
  setAbStageActive,
  setPanZoomState,
  setSwipePosition,
  stageAspectRatio,
  stageRef,
  swipePosition,
}: ViewerStageProps) {
  const stageViewportSize = useElementSize(stageRef);
  const stageSize = useMemo(() => {
    // The parent workbench already collapsed the slot to the fitted shell height, so the stage can
    // size directly from the measured box instead of carrying a second viewport-height fallback.
    return getFittedStageSize(stageViewportSize, stageAspectRatio);
  }, [stageAspectRatio, stageViewportSize]);

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
      <StagePresentationShell
        stageSize={stageSize}
        stageAspectRatio={stageAspectRatio}
        inspectActive={mode === "a-b" && abStageActive}
      >
        <ViewerStageContent
          abSide={abSide}
          abStageActive={abStageActive}
          afterAsset={afterAsset}
          beforeAsset={beforeAsset}
          devicePixelRatio={devicePixelRatio}
          heatmapAsset={heatmapAsset}
          mode={mode}
          onCycleAbSide={onCycleAbSide}
          overlayOpacity={overlayOpacity}
          panZoomState={panZoomState}
          rotateStage={rotateStage}
          setAbStageActive={setAbStageActive}
          setPanZoomState={setPanZoomState}
          setSwipePosition={setSwipePosition}
          swipePosition={swipePosition}
        />
      </StagePresentationShell>
    </Box>
  );
}
