"use client";

import { Box } from "@mui/material";
import type {
  ViewerMediaRect,
  ViewerPanZoomState,
  ViewerStageSize,
} from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import { useEffect, useRef } from "react";
import { PositionedStageMedia } from "./positioned-stage-media";
import { useStagePanZoom } from "./use-stage-pan-zoom";

/**
 * Wraps A/B inspect mode so activation, side cycling, and pan/zoom all stay tied to the same stage
 * surface.
 */
export function ABCompareStage({
  active,
  activeAsset,
  viewportSize,
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
  viewportSize: ViewerStageSize;
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
      onClick={handleClick}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        touchAction: active ? "none" : "pan-y",
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
        clipRect={clipRect}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
        panZoomState={panZoomState}
        effectiveScale={effectiveScale}
        imageRendering="pixelated"
      />
    </Box>
  );
}
