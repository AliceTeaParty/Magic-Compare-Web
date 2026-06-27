"use client";

import { Box } from "@mui/material";
import type { ViewerMediaRect } from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import { type CSSProperties } from "react";
import { clampNumber } from "@magic-compare/shared-utils";
import { PositionedStageMedia } from "./positioned-stage-media";
import {
  getSwipeCompareGeometry,
  getSwipeCssValues,
} from "./swipe-compare-geometry";
import { useSwipeCompareDrag } from "./use-swipe-compare-drag";
import { viewerTokens } from "./viewer-tokens";

/** Draws the visible compare boundary using transform-only movement during drag. */
function SwipeDivider({
  isVertical,
  mediaRect,
}: {
  isVertical: boolean;
  mediaRect: ViewerMediaRect;
}) {
  return (
    <Box
      sx={{
        position: "absolute",
        top: `${mediaRect.y}px`,
        height: isVertical ? 2 : `${mediaRect.height}px`,
        left: `${mediaRect.x}px`,
        width: isVertical ? `${mediaRect.width}px` : 2,
        transform: isVertical
          ? "translateY(var(--swipe-offset)) translateY(-1px)"
          : "translateX(var(--swipe-offset)) translateX(-1px)",
        backgroundColor: viewerTokens.swipe.dividerSurface,
        boxShadow: viewerTokens.swipe.dividerShadow,
        pointerEvents: "none",
      }}
    />
  );
}

/** Renders the swipe affordance separately from gesture logic so the stage stays easy to scan. */
function SwipeHandle({
  isVertical,
  mediaRect,
}: {
  isVertical: boolean;
  mediaRect: ViewerMediaRect;
}) {
  return (
    <Box
      sx={{
        position: "absolute",
        left: isVertical
          ? `${mediaRect.x + mediaRect.width / 2}px`
          : `${mediaRect.x}px`,
        top: isVertical
          ? `${mediaRect.y}px`
          : `${mediaRect.y + mediaRect.height / 2}px`,
        transform: isVertical
          ? "translate(-50%, -50%) translateY(var(--swipe-offset))"
          : "translate(-50%, -50%) translateX(var(--swipe-offset))",
        width: 42,
        height: 42,
        borderRadius: "999px",
        border: viewerTokens.swipe.handleBorder,
        backgroundColor: viewerTokens.swipe.handleSurface,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: viewerTokens.swipe.handleShadow,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        "&::before, &::after": {
          content: '""',
          position: "absolute",
          width: 8,
          height: 8,
          borderTop: viewerTokens.swipe.handleChevronBorder,
          borderRight: viewerTokens.swipe.handleChevronBorder,
          filter: viewerTokens.swipe.handleChevronShadow,
        },
        "&::before": {
          ...(isVertical
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
          ...(isVertical
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
  );
}

/**
 * Keeps swipe compare aligned with the visible split direction, including the rotated mobile stage
 * where the divider becomes top/bottom instead of left/right.
 */
export function SwipeCompareStage({
  beforeAsset,
  afterAsset,
  mediaRect,
  prefersReducedMotion,
  rotateStage,
  setSwipePosition,
  swipePosition,
}: {
  beforeAsset: ViewerAsset;
  afterAsset: ViewerAsset;
  mediaRect: ViewerMediaRect;
  prefersReducedMotion: boolean;
  rotateStage: boolean;
  setSwipePosition: (value: number) => void;
  swipePosition: number;
}) {
  const clampedSwipePosition = clampNumber(swipePosition, 0, 100);
  const { axisLength, isVertical } = getSwipeCompareGeometry({
    mediaRect,
    rotateStage,
  });
  const swipeValues = getSwipeCssValues({
    axisLength,
    position: clampedSwipePosition,
  });
  const swipeCssVariables = {
    "--swipe-position": `${swipeValues.position}%`,
    "--swipe-ratio": `${swipeValues.ratio}`,
    "--swipe-offset": `${swipeValues.offset}px`,
  } as CSSProperties;
  const {
    finishPointerDrag,
    handlePointerDown,
    handlePointerMove,
    viewportRef,
  } = useSwipeCompareDrag({
    axisLength,
    mediaRect,
    rotateStage,
    setSwipePosition,
    swipePosition: clampedSwipePosition,
  });

  return (
    <Box
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      onDragStart={(event) => event.preventDefault()}
      style={swipeCssVariables}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        touchAction: "none",
        cursor: isVertical ? "ns-resize" : "ew-resize",
        userSelect: "none",
      }}
    >
      <PositionedStageMedia
        asset={beforeAsset}
        alt={`${beforeAsset.label} image`}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
        loading="eager"
        decoding="async"
        fetchPriority="high"
        prefersReducedMotion={prefersReducedMotion}
      />
      <PositionedStageMedia
        asset={afterAsset}
        alt={`${afterAsset.label} image`}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
        loading="eager"
        decoding="async"
        fetchPriority="high"
        prefersReducedMotion={prefersReducedMotion}
        clipPath={
          isVertical
            ? "inset(0 0 calc(100% - var(--swipe-position)) 0)"
            : "inset(0 calc(100% - var(--swipe-position)) 0 0)"
        }
      />
      <SwipeDivider isVertical={isVertical} mediaRect={mediaRect} />
      <SwipeHandle isVertical={isVertical} mediaRect={mediaRect} />
    </Box>
  );
}
