"use client";

import { PhotoLibrary } from "@mui/icons-material";
import { Alert, Box, Stack, Typography } from "@mui/material";
import {
  getContainedMediaRect,
  getViewerEffectiveScale,
  type ViewerMediaRect,
  type ViewerPanZoomState,
} from "@magic-compare/compare-core";
import type { ViewerMode } from "@magic-compare/content-schema";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useState,
} from "react";
import { clampNumber } from "@magic-compare/shared-utils";
import { useStagePanZoom } from "./use-stage-pan-zoom";

export interface ViewportSize {
  width: number;
  height: number;
}

export interface StageSize {
  width: number;
  height: number;
}

export const DEFAULT_PAN_ZOOM: ViewerPanZoomState = {
  presetScale: 1,
  fineScale: 1,
  x: 0,
  y: 0,
};

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
 * Uses a deterministic string key so fit mode can tell the difference between "same viewport,
 * toggle off" and "new viewport, recompute fit".
 */
export function getViewportSignature(viewportSize: ViewportSize): string {
  return `${viewportSize.width}x${viewportSize.height}`;
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
 * Orders transforms so auto-rotated portrait mode still pans in screen coordinates; otherwise a
 * horizontal drag would become vertical movement after the 90-degree rotation is applied.
 */
function buildMediaTransform(
  rotateStage: boolean,
  panZoomState: ViewerPanZoomState,
  effectiveScale: number,
): CSSProperties["transform"] {
  return [
    "translate(-50%, -50%)",
    `translate3d(${panZoomState.x}px, ${panZoomState.y}px, 0)`,
    rotateStage ? "rotate(90deg)" : "",
    `scale(${effectiveScale})`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Renders a single asset into the contained media rect while keeping pan/zoom and rotated portrait
 * layout consistent across swipe, A/B, and heatmap modes.
 */
function PositionedStageMedia({
  asset,
  alt,
  mediaRect,
  rotateStage,
  panZoomState = DEFAULT_PAN_ZOOM,
  effectiveScale = 1,
  imageRendering,
  opacity = 1,
  clipPath,
}: {
  asset: ViewerAsset;
  alt: string;
  mediaRect: ViewerMediaRect;
  rotateStage: boolean;
  panZoomState?: ViewerPanZoomState;
  effectiveScale?: number;
  imageRendering?: CSSProperties["imageRendering"];
  opacity?: number;
  clipPath?: string;
}) {
  if (mediaRect.width <= 0 || mediaRect.height <= 0) {
    return null;
  }

  const mediaWidth = rotateStage ? mediaRect.height : mediaRect.width;
  const mediaHeight = rotateStage ? mediaRect.width : mediaRect.height;

  return (
    <Box
      sx={{
        position: "absolute",
        left: `${mediaRect.x}px`,
        top: `${mediaRect.y}px`,
        width: `${mediaRect.width}px`,
        height: `${mediaRect.height}px`,
        overflow: "hidden",
        clipPath,
        pointerEvents: "none",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: `${mediaWidth}px`,
          height: `${mediaHeight}px`,
          transform: buildMediaTransform(
            rotateStage,
            panZoomState,
            effectiveScale,
          ),
          transformOrigin: "center center",
          transition: "opacity 180ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        }}
      >
        <Box
          component="img"
          src={asset.imageUrl}
          alt={alt}
          draggable={false}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "fill",
            imageRendering,
            display: "block",
            opacity,
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserDrag: "none",
          }}
        />
      </Box>
    </Box>
  );
}

/**
 * Keeps swipe compare aligned with the visible split direction, including the rotated mobile stage
 * where the divider becomes top/bottom instead of left/right.
 */
function SwipeCompareStage({
  beforeAsset,
  afterAsset,
  mediaRect,
  rotateStage,
  setSwipePosition,
  swipePosition,
}: {
  beforeAsset: ViewerAsset;
  afterAsset: ViewerAsset;
  mediaRect: ViewerMediaRect;
  rotateStage: boolean;
  setSwipePosition: (value: number) => void;
  swipePosition: number;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  /**
   * Uses the rotated axis when portrait auto-rotation is active so the handle follows the divider
   * users actually see on screen instead of preserving the old horizontal math.
   */
  function updateSwipePosition(clientX: number, clientY: number) {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();

    if (rotateStage) {
      if (mediaRect.height <= 0) {
        return;
      }

      // Rotated portrait mode presents the compare split vertically stacked, so swipe must follow Y.
      const localY = clientY - rect.top - mediaRect.y;
      setSwipePosition(clampNumber((localY / mediaRect.height) * 100, 0, 100));
      return;
    }

    if (mediaRect.width <= 0) {
      return;
    }

    const localX = clientX - rect.left - mediaRect.x;
    setSwipePosition(clampNumber((localX / mediaRect.width) * 100, 0, 100));
  }

  /**
   * Captures the pointer so the divider continues tracking a drag even when the finger leaves the
   * visual handle.
   */
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateSwipePosition(event.clientX, event.clientY);
  }

  /**
   * Ignores unrelated pointers so multitouch or stray hover events cannot move the active divider.
   */
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    updateSwipePosition(event.clientX, event.clientY);
  }

  /**
   * Releases capture on end/cancel so later gestures can start cleanly without inheriting a stale
   * active pointer id.
   */
  function finishPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activePointerIdRef.current = null;
  }

  return (
    <Box
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      onDragStart={(event) => event.preventDefault()}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        touchAction: "none",
        cursor: rotateStage ? "ns-resize" : "ew-resize",
        userSelect: "none",
      }}
    >
      <PositionedStageMedia
        asset={beforeAsset}
        alt={`${beforeAsset.label} preview`}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
      />
      <PositionedStageMedia
        asset={afterAsset}
        alt={`${afterAsset.label} preview`}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
        clipPath={
          rotateStage
            ? `inset(0 0 ${100 - swipePosition}% 0)`
            : `inset(0 ${100 - swipePosition}% 0 0)`
        }
      />
      <Box
        sx={{
          position: "absolute",
          top: rotateStage
            ? `${mediaRect.y + (mediaRect.height * swipePosition) / 100}px`
            : `${mediaRect.y}px`,
          height: rotateStage ? 2 : `${mediaRect.height}px`,
          left: rotateStage
            ? `${mediaRect.x}px`
            : `${mediaRect.x + (mediaRect.width * swipePosition) / 100}px`,
          width: rotateStage ? `${mediaRect.width}px` : 2,
          transform: rotateStage ? "translateY(-1px)" : "translateX(-1px)",
          backgroundColor: "rgba(248, 245, 255, 0.88)",
          boxShadow:
            "0 0 14px rgba(228, 194, 242, 0.24), 0 0 36px rgba(242, 235, 201, 0.12)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          left: rotateStage
            ? `${mediaRect.x + mediaRect.width / 2}px`
            : `${mediaRect.x + (mediaRect.width * swipePosition) / 100}px`,
          top: rotateStage
            ? `${mediaRect.y + (mediaRect.height * swipePosition) / 100}px`
            : `${mediaRect.y + mediaRect.height / 2}px`,
          transform: "translate(-50%, -50%)",
          width: 42,
          height: 42,
          borderRadius: "999px",
          border: "1px solid rgba(248, 245, 255, 0.22)",
          backgroundColor: "rgba(22, 37, 76, 0.34)",
          backdropFilter: "blur(10px)",
          boxShadow:
            "0 10px 24px rgba(10, 18, 42, 0.18), 0 0 18px rgba(228, 194, 242, 0.18)",
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
          "&::before, &::after": {
            content: '""',
            position: "absolute",
            width: 8,
            height: 8,
            borderTop: "2px solid rgba(248, 245, 255, 0.72)",
            borderRight: "2px solid rgba(248, 245, 255, 0.72)",
            filter: "drop-shadow(0 0 5px rgba(10, 18, 42, 0.2))",
          },
          "&::before": {
            ...(rotateStage
              ? {
                  top: 12,
                  left: "50%",
                  transform: "translateX(-50%) rotate(-45deg)",
                }
              : {
                  top: "50%",
                  left: 10,
                  transform: "translateY(-50%) rotate(-135deg)",
                }),
          },
          "&::after": {
            ...(rotateStage
              ? {
                  bottom: 12,
                  left: "50%",
                  transform: "translateX(-50%) rotate(135deg)",
                }
              : {
                  top: "50%",
                  right: 10,
                  transform: "translateY(-50%) rotate(45deg)",
                }),
          },
        }}
      />
    </Box>
  );
}

/**
 * Wraps A/B inspect mode so activation, side cycling, and pan/zoom all stay tied to the same stage
 * surface.
 */
function ABCompareStage({
  active,
  activeAsset,
  devicePixelRatio,
  mediaRect,
  onCycleSide,
  panZoomState,
  rotateStage,
  setActive,
  setPanZoomState,
}: {
  active: boolean;
  activeAsset: ViewerAsset;
  devicePixelRatio: number;
  mediaRect: ViewerMediaRect;
  onCycleSide: () => void;
  panZoomState: ViewerPanZoomState;
  rotateStage: boolean;
  setActive: (nextActive: boolean) => void;
  setPanZoomState: (nextState: ViewerPanZoomState) => void;
}) {
  const stageSurfaceRef = useRef<HTMLDivElement | null>(null);
  const {
    consumeStageClick,
    effectiveScale,
    handleNonPassiveWheel,
    stageHandlers,
  } = useStagePanZoom({
    active,
    activeAsset,
    devicePixelRatio,
    mediaRect,
    panZoomState,
    rotateStage,
    setPanZoomState,
  });

  useEffect(() => {
    const stageNode = stageSurfaceRef.current;

    if (!stageNode) {
      return;
    }

    /**
     * Browser zoom gestures must be cancellable at the DOM layer because React can delegate wheel
     * listeners passively, which still applies the zoom but pollutes the console during smoke/CI.
     */
    function handleWheel(event: WheelEvent) {
      handleNonPassiveWheel(event);
    }

    stageNode.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      stageNode.removeEventListener("wheel", handleWheel);
    };
  }, [handleNonPassiveWheel]);

  /**
   * Uses a single click target for both entry and side cycling so A/B mode stays compact on mobile
   * without adding extra controls over the image.
   */
  function handleClick() {
    if (!consumeStageClick()) {
      return;
    }

    if (!active) {
      setActive(true);
      return;
    }

    onCycleSide();
  }

  return (
    <Box
      ref={stageSurfaceRef}
      {...stageHandlers}
      onClick={handleClick}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        touchAction: "pan-y",
        cursor: active ? (effectiveScale > 1 ? "grab" : "pointer") : "pointer",
        userSelect: "none",
        borderRadius: 2.25,
        outline: active
          ? "1px solid rgba(232, 198, 246, 0.48)"
          : "1px solid transparent",
        boxShadow: active
          ? "0 0 0 1px rgba(232, 198, 246, 0.08), 0 0 22px rgba(228, 194, 242, 0.14)"
          : "none",
        transition:
          "outline-color 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <PositionedStageMedia
        asset={activeAsset}
        alt={`${activeAsset.label} preview`}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
        panZoomState={panZoomState}
        effectiveScale={effectiveScale}
        imageRendering="pixelated"
      />
    </Box>
  );
}

/**
 * Keeps the visual frame around the compare stage responsible only for sizing and chrome so each
 * mode can focus on its own interaction rules.
 */
function StagePresentationShell({
  children,
  fittedSize,
  inspectActive,
  rotateStage,
}: {
  children: ReactNode;
  fittedSize: StageSize | null;
  inspectActive?: boolean;
  rotateStage: boolean;
}) {
  const fitActive = Boolean(fittedSize);

  return (
    <Box
      sx={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100%",
        maxWidth: fittedSize ? `${fittedSize.width}px` : "100%",
        minWidth: 0,
        aspectRatio: rotateStage ? "9 / 16" : "16 / 9",
        minHeight: fitActive
          ? 0
          : rotateStage
            ? { xs: 420, md: 520 }
            : { xs: 220, md: 340 },
        maxHeight: fittedSize ? `${fittedSize.height}px` : "none",
        marginInline: "auto",
        borderRadius: 2.5,
        overflow: "hidden",
        border: "1px solid",
        borderColor: inspectActive
          ? "rgba(232, 198, 246, 0.42)"
          : fitActive
            ? "rgba(232, 198, 246, 0.36)"
            : "divider",
        background:
          "radial-gradient(circle at top, rgba(232, 198, 246, 0.1), transparent 28%), rgba(13, 24, 54, 0.94)",
        boxShadow: inspectActive
          ? "0 0 0 1px rgba(232, 198, 246, 0.08), 0 18px 44px rgba(8, 15, 35, 0.28)"
          : fitActive
            ? "0 24px 52px rgba(8, 15, 35, 0.28)"
            : "none",
        transition:
          "max-width 180ms cubic-bezier(0.22, 1, 0.36, 1), max-height 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms cubic-bezier(0.22, 1, 0.36, 1)",
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
  fittedStageSize: StageSize | null;
  heatmapAsset: ViewerAsset | undefined;
  mode: ViewerMode;
  onCycleAbSide: () => void;
  overlayOpacity: number;
  panZoomState: ViewerPanZoomState;
  rotateStage: boolean;
  setAbStageActive: (nextActive: boolean) => void;
  setPanZoomState: (nextState: ViewerPanZoomState) => void;
  setSwipePosition: (value: number) => void;
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
  fittedStageSize,
  heatmapAsset,
  mode,
  onCycleAbSide,
  overlayOpacity,
  panZoomState,
  rotateStage,
  setAbStageActive,
  setPanZoomState,
  setSwipePosition,
  stageRef,
  swipePosition,
}: ViewerStageProps) {
  return (
    <Box
      ref={stageRef}
      sx={{
        width: "100%",
        minWidth: 0,
        display: "grid",
        placeItems: "center",
      }}
    >
      <StagePresentationShell
        fittedSize={fittedStageSize}
        rotateStage={rotateStage}
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
