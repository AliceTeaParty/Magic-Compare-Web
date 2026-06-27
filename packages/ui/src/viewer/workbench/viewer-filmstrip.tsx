"use client";

import { PhotoLibrary } from "@mui/icons-material";
import { Box, Button, Stack, Typography } from "@mui/material";
import type { ViewerFrame } from "@magic-compare/compare-core/viewer-data";
import type { CSSProperties, DragEvent as ReactDragEvent } from "react";
import { useFilmstripDrag } from "./use-filmstrip-drag";
import { viewerTokens } from "./viewer-tokens";

/** Chooses a stable representative thumbnail for each frame without affecting main-stage loading. */
function resolveThumbnailAsset(frame: ViewerFrame) {
  return (
    frame.assets.find((asset) => asset.kind === "after" && asset.isPrimaryDisplay) ??
    frame.assets.find((asset) => asset.kind === "before" && asset.isPrimaryDisplay) ??
    frame.assets[0]
  );
}

/**
 * Keeps each thumbnail button focused on presentation so drag/scroll physics stay in the hook and
 * selection visuals stay local to the card.
 */
function ThumbnailButton({
  frame,
  isActive,
  isNearActive,
  onClick,
  onIntent,
}: {
  frame: ViewerFrame;
  isActive: boolean;
  isNearActive: boolean;
  onClick: () => void;
  onIntent: () => void;
}) {
  const thumbAsset = resolveThumbnailAsset(frame);

  return (
    <Button
      data-frame-id={frame.id}
      onClick={onClick}
      onFocus={onIntent}
      onMouseEnter={onIntent}
      onPointerDown={onIntent}
      sx={{
        // This gives the browser permission to skip painting far-off thumbnails until they scroll
        // closer to view, which trims initial work without changing the drag model.
        contentVisibility: "auto",
        containIntrinsicSize: "152px 114px",
        minWidth: 168,
        maxWidth: 168,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 0.9,
        borderRadius: 2.25,
        border: "1px solid",
        borderColor: isActive ? "primary.main" : "divider",
        backgroundColor: isActive
          ? viewerTokens.filmstrip.activeCardSurface
          : viewerTokens.filmstrip.inactiveCardSurface,
        boxShadow: isActive ? viewerTokens.filmstrip.activeCardInset : "none",
        p: 1.1,
        transition:
          "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1)",
        "&:hover": {
          transform: "translateY(-3px)",
        },
      }}
    >
      <Box
        sx={{
          borderRadius: 2,
          overflow: "hidden",
          backgroundColor: viewerTokens.filmstrip.thumbnailSurface,
          aspectRatio: "16 / 9",
        }}
      >
        {thumbAsset ? (
          <Box
            component="img"
            src={thumbAsset.thumbUrl || thumbAsset.imageUrl}
            alt={frame.title}
            draggable={false}
            loading={isNearActive ? "eager" : "lazy"}
            fetchPriority={isNearActive ? "high" : "auto"}
            decoding="async"
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              pointerEvents: "none",
              userSelect: "none",
              WebkitUserDrag: "none",
            }}
          />
        ) : (
          <Box
            sx={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
            }}
          >
            <PhotoLibrary sx={{ color: "text.secondary" }} />
          </Box>
        )}
      </Box>
      <Stack spacing={0.1} alignItems="center">
        <Typography
          variant="body2"
          fontWeight={600}
          noWrap
          sx={{ width: "100%", textAlign: "center" }}
        >
          {frame.title}
        </Typography>
      </Stack>
    </Button>
  );
}

interface ViewerFilmstripProps {
  currentFrameId: string | undefined;
  frames: ViewerFrame[];
  prefersReducedMotion: boolean;
  onFrameIntent: (frame: ViewerFrame) => void;
  onSelectFrame: (frameId: string) => void;
}

/**
 * Presents frame navigation as a draggable strip so long cases remain usable on touch devices
 * without exposing the lower-level drag physics to the workbench shell.
 */
export function ViewerFilmstrip({
  currentFrameId,
  frames,
  prefersReducedMotion,
  onFrameIntent,
  onSelectFrame,
}: ViewerFilmstripProps) {
  const {
    isDragging,
    scrollbarHandlers,
    scrollbarMetrics,
    stripRef,
    viewportHandlers,
    viewportRef,
    handleFrameSelection,
  } = useFilmstripDrag({
    frameCount: frames.length,
    onSelectFrame,
    prefersReducedMotion,
  });

  /**
   * Prevents the browser's native drag image from hijacking horizontal scrolling when users start a
   * gesture on top of a thumbnail.
   */
  function handleViewportDragStart(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  const activeIndex = frames.findIndex((frame) => frame.id === currentFrameId);

  return (
    <Box
      sx={{
        minWidth: 0,
        px: { xs: 1.5, md: 2.25 },
        pt: { xs: 1.35, md: 2 },
        pb: { xs: 2.1, md: 2.35 },
        borderTop: "1px solid",
        borderBottom: "1px solid",
        borderColor: "divider",
        backgroundColor: viewerTokens.filmstrip.shellSurface,
        position: "relative",
      }}
    >
      <Box
        id="viewer-filmstrip-scrollport"
        ref={viewportRef}
        {...viewportHandlers}
        onDragStart={handleViewportDragStart}
        sx={{
          width: "100%",
          minWidth: 0,
          overflowX: "auto",
          overflowY: "visible",
          overscrollBehaviorX: "contain",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          touchAction: "pan-y",
          cursor: frames.length > 1 ? "grab" : "default",
          "&:active": {
            cursor: frames.length > 1 ? "grabbing" : "default",
          },
          "&::-webkit-scrollbar": {
            display: "none",
          },
        }}
      >
        <Box
          ref={stripRef}
          style={
            {
              "--filmstrip-edge-offset": "0px",
            } as CSSProperties
          }
          sx={{
            display: "flex",
            gap: 1.25,
            width: "max-content",
            minWidth: "100%",
            pt: 0.35,
            pb: 0.75,
            pr: 0.25,
            transform: "translate3d(var(--filmstrip-edge-offset), 0, 0)",
            transition:
              isDragging || prefersReducedMotion
                ? "none"
                : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {frames.map((frame, index) => (
            <ThumbnailButton
              key={frame.id}
              frame={frame}
              isActive={frame.id === currentFrameId}
              isNearActive={
                activeIndex === -1 || Math.abs(index - activeIndex) <= 8
              }
              onClick={() => handleFrameSelection(frame.id)}
              onIntent={() => onFrameIntent(frame)}
            />
          ))}
        </Box>
      </Box>

      {scrollbarMetrics.visible ? (
        <Box
          {...scrollbarHandlers}
          role="scrollbar"
          tabIndex={0}
          aria-label="Frame strip horizontal scroll"
          aria-controls="viewer-filmstrip-scrollport"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={Math.round(scrollbarMetrics.maxScrollLeft)}
          aria-valuenow={Math.round(scrollbarMetrics.scrollLeft)}
          sx={{
            position: "absolute",
            left: { xs: 12, md: 18 },
            right: { xs: 12, md: 18 },
            bottom: { xs: 4, md: 7 },
            height: { xs: 18, md: 16 },
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            cursor: "grab",
            touchAction: "none",
            "&:active": {
              cursor: "grabbing",
            },
            "&:focus-visible": {
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: 4,
            },
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: "100%",
              height: 6,
              borderRadius: 999,
              backgroundColor: viewerTokens.filmstrip.scrollbarTrack,
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            <Box
              sx={{
                width: `${scrollbarMetrics.thumbWidth}px`,
                height: "100%",
                borderRadius: 999,
                background: viewerTokens.filmstrip.scrollbarThumb,
                transform: `translate3d(${scrollbarMetrics.thumbOffset}px, 0, 0)`,
                transition:
                  isDragging || prefersReducedMotion
                    ? "none"
                    : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), width 180ms cubic-bezier(0.22, 1, 0.36, 1)",
                boxShadow: viewerTokens.filmstrip.scrollbarThumbRing,
              }}
            />
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
