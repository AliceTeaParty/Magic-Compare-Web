"use client";

import { Box } from "@mui/material";
import type {
  ViewerMediaRect,
  ViewerPanZoomState,
} from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import { useEffect, useRef, useState, type CSSProperties } from "react";

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
  opacity = 1,
  clipPath,
  prefersReducedMotion = false,
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
  opacity?: number;
  clipPath?: string;
  prefersReducedMotion?: boolean;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loadState, setLoadState] = useState<{
    imageUrl: string | null;
    status: "loaded" | "error";
  }>({
    imageUrl: null,
    status: "error",
  });

  useEffect(() => {
    const image = imageRef.current;
    if (!image) {
      return;
    }

    if (image.complete && image.naturalWidth > 0) {
      setLoadState({ imageUrl: asset.imageUrl, status: "loaded" });
    }
  }, [asset.imageUrl]);

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
  const showImage =
    loadState.imageUrl === asset.imageUrl && loadState.status === "loaded";

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
        {!showImage ? (
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              opacity,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))",
              "&::before": {
                content: '""',
                position: "absolute",
                inset: 0,
                backgroundImage: [
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 48%, transparent 96%)",
                  "linear-gradient(90deg, rgba(255,255,255,0.12) 0 18%, transparent 18% 24%, rgba(255,255,255,0.08) 24% 52%, transparent 52% 59%, rgba(255,255,255,0.1) 59% 82%, transparent 82%)",
                  "linear-gradient(90deg, rgba(255,255,255,0.08) 0 28%, transparent 28% 34%, rgba(255,255,255,0.11) 34% 64%, transparent 64% 70%, rgba(255,255,255,0.07) 70% 100%)",
                  "linear-gradient(90deg, rgba(255,255,255,0.1) 0 38%, transparent 38% 45%, rgba(255,255,255,0.08) 45% 74%, transparent 74%)",
                ].join(", "),
                backgroundSize:
                  "42% 100%, 100% 18%, 100% 24%, 100% 16%",
                backgroundPosition:
                  "-60% 0, 0 18%, 0 48%, 0 78%",
                backgroundRepeat: "no-repeat",
                animation: prefersReducedMotion
                  ? "none"
                  : "magic-stage-skeleton-sweep 1250ms cubic-bezier(0.22, 1, 0.36, 1) infinite",
              },
              "@keyframes magic-stage-skeleton-sweep": {
                "0%": {
                  backgroundPosition:
                    "-60% 0, 0 18%, 0 48%, 0 78%",
                },
                "100%": {
                  backgroundPosition:
                    "160% 0, 0 18%, 0 48%, 0 78%",
                },
              },
            }}
          />
        ) : null}
        <Box
          component="img"
          src={asset.imageUrl}
          alt={alt}
          draggable={false}
          loading={loading}
          decoding={decoding}
          fetchPriority={fetchPriority}
          onLoad={() =>
            setLoadState({ imageUrl: asset.imageUrl, status: "loaded" })
          }
          onError={() =>
            setLoadState({ imageUrl: asset.imageUrl, status: "error" })
          }
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "fill",
            imageRendering,
            display: "block",
            opacity: showImage ? opacity : 0,
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserDrag: "none",
            transition: prefersReducedMotion
              ? "none"
              : "opacity 160ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </Box>
    </Box>
  );
}
