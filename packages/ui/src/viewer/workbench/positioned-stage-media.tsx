"use client";

import { Box } from "@mui/material";
import type {
  ViewerMediaRect,
  ViewerPanZoomState,
} from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import type { CSSProperties } from "react";

export const DEFAULT_PAN_ZOOM: ViewerPanZoomState = {
  presetScale: 1,
  fineScale: 1,
  x: 0,
  y: 0,
};

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
export function PositionedStageMedia({
  asset,
  alt,
  clipRect,
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
  clipRect?: ViewerMediaRect;
  mediaRect: ViewerMediaRect;
  rotateStage: boolean;
  panZoomState?: ViewerPanZoomState;
  effectiveScale?: number;
  imageRendering?: CSSProperties["imageRendering"];
  opacity?: number;
  clipPath?: string;
}) {
  const resolvedClipRect = clipRect ?? mediaRect;

  if (
    mediaRect.width <= 0 ||
    mediaRect.height <= 0 ||
    resolvedClipRect.width <= 0 ||
    resolvedClipRect.height <= 0
  ) {
    return null;
  }

  const mediaWidth = rotateStage ? mediaRect.height : mediaRect.width;
  const mediaHeight = rotateStage ? mediaRect.width : mediaRect.height;
  const mediaCenterX =
    mediaRect.x + mediaRect.width / 2 - resolvedClipRect.x;
  const mediaCenterY =
    mediaRect.y + mediaRect.height / 2 - resolvedClipRect.y;

  return (
    <Box
      sx={{
        position: "absolute",
        left: `${resolvedClipRect.x}px`,
        top: `${resolvedClipRect.y}px`,
        width: `${resolvedClipRect.width}px`,
        height: `${resolvedClipRect.height}px`,
        overflow: "hidden",
        clipPath,
        pointerEvents: "none",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          left: `${mediaCenterX}px`,
          top: `${mediaCenterY}px`,
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
