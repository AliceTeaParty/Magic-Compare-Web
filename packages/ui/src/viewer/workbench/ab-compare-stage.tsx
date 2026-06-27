"use client";

import { Box } from "@mui/material";
import type {
  ViewerMediaRect,
  ViewerPanZoomState,
  ViewerStageSize,
} from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { PositionedStageMedia } from "./positioned-stage-media";
import { useStagePanZoom } from "./use-stage-pan-zoom";
import { viewerTokens } from "./viewer-tokens";

/**
 * Wraps A/B inspect mode so activation, side cycling, and pan/zoom all stay tied to the same stage
 * surface.
 */
export function ABCompareStage({
  active,
  afterAsset,
  viewportSize,
  beforeAsset,
  devicePixelRatio,
  mediaRect,
  onCycleSide,
  panZoomState,
  prefersReducedMotion,
  rotateStage,
  side,
  setActive,
  setPanZoomState,
}: {
  active: boolean;
  afterAsset: ViewerAsset;
  beforeAsset: ViewerAsset;
  viewportSize: ViewerStageSize;
  devicePixelRatio: number;
  mediaRect: ViewerMediaRect;
  onCycleSide: () => void;
  panZoomState: ViewerPanZoomState;
  prefersReducedMotion: boolean;
  rotateStage: boolean;
  side: "before" | "after";
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
    activeAsset: side === "before" ? beforeAsset : afterAsset,
    clampViewport: viewportSize,
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

  /**
   * Mirrors click activation for keyboard users while preventing Space from scrolling the page and
   * leaking into the viewer's document-level shortcut handling.
   */
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleClick();
  }

  const clipRect =
    active && effectiveScale > 1
      ? {
          x: 0,
          y: 0,
          width: viewportSize.width,
          height: viewportSize.height,
        }
      : mediaRect;
  // Once inspect mode zooms beyond 1x, the old contained-media rect becomes an accidental inner
  // mask. Switch clipping to the full stage viewport so wide stages do not reintroduce a hidden
  // 16:9 crop while panning.

  return (
    <Box
      ref={stageSurfaceRef}
      {...stageHandlers}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={
        active
          ? `A/B inspect stage. Showing ${side}. Press Enter or Space to switch sides.`
          : "A/B inspect stage. Press Enter or Space to activate inspection."
      }
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        touchAction: active ? "none" : "pan-y",
        cursor: active ? (effectiveScale > 1 ? "grab" : "pointer") : "pointer",
        userSelect: "none",
        borderRadius: 2.25,
        outline: active ? viewerTokens.abStage.activeOutline : "1px solid transparent",
        boxShadow: active ? viewerTokens.abStage.activeShadow : "none",
        transition:
          "outline-color 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1)",
        "&:focus-visible": {
          outline: viewerTokens.abStage.activeOutline,
          boxShadow: viewerTokens.abStage.activeShadow,
        },
      }}
    >
      {[
        { asset: beforeAsset, side: "before" as const },
        { asset: afterAsset, side: "after" as const },
      ].map((layer) => {
        const isVisibleLayer = layer.side === side;

        return (
          <PositionedStageMedia
            key={layer.side}
            asset={layer.asset}
            alt={`${layer.asset.label} image`}
            clipRect={clipRect}
            mediaRect={mediaRect}
            rotateStage={rotateStage}
            panZoomState={panZoomState}
            effectiveScale={effectiveScale}
            imageRendering="pixelated"
            loading="eager"
            decoding="async"
            fetchPriority={isVisibleLayer ? "high" : "auto"}
            opacity={isVisibleLayer ? 1 : 0}
            prefersReducedMotion={prefersReducedMotion}
            showFallback={isVisibleLayer}
            animateOpacity={false}
          />
        );
      })}
    </Box>
  );
}
