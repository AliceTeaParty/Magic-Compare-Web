"use client";

import { Box } from "@mui/material";
import type { ViewerMediaRect, ViewerPanZoomState } from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import { type CSSProperties } from "react";
import { StageImageFallback } from "./stage-image-fallback";
import { useStageImageLoadState } from "./use-stage-image-load-state";

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
  loading,
  decoding,
  fetchPriority,
  fallbackContentPosition,
  fallbackErrorMessage,
  opacity = 1,
  clipPath,
  prefersReducedMotion = false,
  showFallback = true,
  animateOpacity = true,
  willChangeTransform = false,
}: {
  asset: ViewerAsset;
  alt: string;
  clipRect?: ViewerMediaRect;
  mediaRect: ViewerMediaRect;
  rotateStage: boolean;
  panZoomState?: ViewerPanZoomState;
  effectiveScale?: number;
  imageRendering?: CSSProperties["imageRendering"];
  loading?: "eager" | "lazy";
  decoding?: "async" | "auto" | "sync";
  fetchPriority?: "high" | "low" | "auto";
  fallbackContentPosition?: { left: string; top: string };
  fallbackErrorMessage?: string;
  opacity?: number;
  clipPath?: string;
  prefersReducedMotion?: boolean;
  showFallback?: boolean;
  animateOpacity?: boolean;
  willChangeTransform?: boolean;
}) {
  const { hasError, imageRef, markErrored, markLoaded, showImage } = useStageImageLoadState(
    asset.imageUrl,
  );

  const resolvedClipRect = clipRect ?? mediaRect;
  const hasMeasuredGeometry =
    mediaRect.width > 0 &&
    mediaRect.height > 0 &&
    resolvedClipRect.width > 0 &&
    resolvedClipRect.height > 0;

  const mediaWidth = rotateStage ? mediaRect.height : mediaRect.width;
  const mediaHeight = rotateStage ? mediaRect.width : mediaRect.height;
  const mediaCenterX = mediaRect.x + mediaRect.width / 2 - resolvedClipRect.x;
  const mediaCenterY = mediaRect.y + mediaRect.height / 2 - resolvedClipRect.y;

  return (
    <Box
      sx={{
        position: "absolute",
        ...(hasMeasuredGeometry
          ? {
              left: `${resolvedClipRect.x}px`,
              top: `${resolvedClipRect.y}px`,
              width: `${resolvedClipRect.width}px`,
              height: `${resolvedClipRect.height}px`,
            }
          : { inset: 0 }),
        overflow: "hidden",
        clipPath,
        pointerEvents: "none",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          ...(hasMeasuredGeometry
            ? {
                left: `${mediaCenterX}px`,
                top: `${mediaCenterY}px`,
                width: `${mediaWidth}px`,
                height: `${mediaHeight}px`,
                transform: buildMediaTransform(rotateStage, panZoomState, effectiveScale),
              }
            : { inset: 0 }),
          transformOrigin: "center center",
          // Persistent promotion kept every full-size image in its own compositor layer. Only the
          // visible A/B asset needs that hint while inspect transforms can change interactively.
          willChange: willChangeTransform ? "transform" : "auto",
        }}
      >
        {!showImage && showFallback ? (
          <StageImageFallback
            contentPosition={fallbackContentPosition}
            counterRotate={rotateStage}
            errorMessage={fallbackErrorMessage}
            errored={hasError}
            opacity={opacity}
            prefersReducedMotion={prefersReducedMotion}
          />
        ) : null}
        <Box
          component="img"
          ref={imageRef}
          src={asset.imageUrl}
          alt={alt}
          width={asset.width}
          height={asset.height}
          data-viewer-stage-image=""
          draggable={false}
          loading={loading}
          decoding={decoding}
          fetchPriority={fetchPriority}
          onLoad={markLoaded}
          onError={markErrored}
          sx={{
            width: "100%",
            height: "100%",
            // Before ResizeObserver runs, keeping the real image in a contained box lets SSR start
            // the LCP request without guessing a crop or replacing the inspection source.
            objectFit: hasMeasuredGeometry ? "fill" : "contain",
            imageRendering,
            display: "block",
            opacity: showImage ? opacity : 0,
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserDrag: "none",
            transition:
              prefersReducedMotion || !animateOpacity
                ? "none"
                : "opacity 160ms cubic-bezier(0.2, 0, 0, 1)",
          }}
        />
      </Box>
    </Box>
  );
}
