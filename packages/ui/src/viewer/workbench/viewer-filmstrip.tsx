"use client";

import { PhotoLibrary } from "@mui/icons-material";
import { Box, Button, Stack, Typography } from "@mui/material";
import type { ViewerFrame } from "@magic-compare/compare-core/viewer-data";
import {
  memo,
  useEffect,
  useRef,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
} from "react";
import { useFilmstripDrag } from "./use-filmstrip-drag";
import {
  FILMSTRIP_CARD_WIDTH,
  FILMSTRIP_ITEM_STRIDE,
  getFilmstripRenderWindow,
} from "./filmstrip-window";
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
  onFrameIntent,
  onSelectFrame,
}: {
  frame: ViewerFrame;
  isActive: boolean;
  isNearActive: boolean;
  onFrameIntent: (frame: ViewerFrame) => void;
  onSelectFrame: (frameId: string) => void;
}) {
  const thumbAsset = resolveThumbnailAsset(frame);
  const hoverIntentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Cancels speculative hover work when the pointer only crosses a thumbnail while scrolling. */
  function cancelHoverIntent() {
    if (hoverIntentTimerRef.current) {
      clearTimeout(hoverIntentTimerRef.current);
      hoverIntentTimerRef.current = null;
    }
  }

  function handleImmediateIntent() {
    cancelHoverIntent();
    onFrameIntent(frame);
  }

  function handleMouseEnter() {
    cancelHoverIntent();
    hoverIntentTimerRef.current = setTimeout(() => {
      hoverIntentTimerRef.current = null;
      onFrameIntent(frame);
    }, 150);
  }

  useEffect(() => cancelHoverIntent, []);

  return (
    <Button
      data-frame-id={frame.id}
      aria-label={frame.title}
      aria-pressed={isActive}
      onClick={() => onSelectFrame(frame.id)}
      onFocus={handleImmediateIntent}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelHoverIntent}
      onPointerDown={handleImmediateIntent}
      sx={{
        // This gives the browser permission to skip painting far-off thumbnails until they scroll
        // closer to view, which trims initial work without changing the drag model.
        contentVisibility: "auto",
        containIntrinsicSize: "140px 104px",
        minWidth: 148,
        maxWidth: 148,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 0.65,
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: isActive ? "primary.main" : "divider",
        color: isActive ? "primary.onContainer" : "text.primary",
        backgroundColor: isActive
          ? viewerTokens.filmstrip.activeCardSurface
          : viewerTokens.filmstrip.inactiveCardSurface,
        boxShadow: isActive ? viewerTokens.filmstrip.activeCardInset : "none",
        p: 0.75,
        // Hover feedback changes the M3 state layer only; moving thumbnails made the filmstrip feel
        // unstable and changed the pointer target while scanning adjacent frames.
        transition:
          "border-color 150ms cubic-bezier(0.2, 0, 0, 1), background-color 150ms cubic-bezier(0.2, 0, 0, 1), box-shadow 150ms cubic-bezier(0.2, 0, 0, 1)",
        "&:hover": {
          backgroundColor: isActive
            ? viewerTokens.filmstrip.activeCardSurface
            : "var(--mui-palette-surface-containerHigh)",
        },
      }}
    >
      <Box
        sx={{
          borderRadius: 1,
          overflow: "hidden",
          backgroundColor: viewerTokens.filmstrip.thumbnailSurface,
          aspectRatio: "16 / 9",
        }}
      >
        {thumbAsset ? (
          <Box
            component="img"
            src={thumbAsset.thumbUrl || thumbAsset.imageUrl}
            alt=""
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
      <Stack
        spacing={0.1}
        sx={{
          alignItems: "center",
        }}
      >
        <Typography
          variant="body2"
          noWrap
          sx={{
            fontWeight: 600,
            fontSize: "0.78rem",
            width: "100%",
            textAlign: "center",
          }}
        >
          {frame.title}
        </Typography>
      </Stack>
    </Button>
  );
}

// Scrollbar position updates rerender the filmstrip shell every frame. Stable callbacks plus memo
// keep unchanged thumbnail image subtrees out of that hot path while the virtual window moves.
const MemoizedThumbnailButton = memo(ThumbnailButton);

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
  const activeIndex = frames.findIndex((frame) => frame.id === currentFrameId);
  const {
    filmstripScrollState,
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
  const renderWindow = getFilmstripRenderWindow({
    clientWidth: filmstripScrollState.clientWidth,
    frameCount: frames.length,
    scrollLeft: filmstripScrollState.scrollLeft,
  });
  const visibleFrames = frames.slice(renderWindow.start, renderWindow.end);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || activeIndex < 0 || filmstripScrollState.clientWidth <= 0) {
      return;
    }

    const cardLeft = activeIndex * FILMSTRIP_ITEM_STRIDE;
    const cardRight = cardLeft + FILMSTRIP_CARD_WIDTH;
    const viewportRight = viewport.scrollLeft + viewport.clientWidth;
    if (cardLeft >= viewport.scrollLeft && cardRight <= viewportRight) {
      return;
    }

    // Selection can come from keyboard or restored state. Moving the native viewport first lets its
    // scroll event update the virtual window without pinning rendering to a stale selected frame.
    viewport.scrollLeft = Math.max(0, cardLeft - (viewport.clientWidth - FILMSTRIP_CARD_WIDTH) / 2);
  }, [activeIndex, filmstripScrollState.clientWidth, viewportRef]);

  /**
   * Prevents the browser's native drag image from hijacking horizontal scrolling when users start a
   * gesture on top of a thumbnail.
   */
  function handleViewportDragStart(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  return (
    <Box
      sx={{
        minWidth: 0,
        px: { xs: 1.25, md: 1.5 },
        pt: { xs: 1.1, md: 1.25 },
        // The scrollbar now provides its own 24px hit target, so a smaller inset preserves the
        // filmstrip's overall density without crowding the visible rail against the shell edge.
        pb: { xs: 0.5, md: 0.75 },
        borderTop: "1px solid",
        borderBottom: "1px solid",
        borderColor: "divider",
        backgroundColor: viewerTokens.filmstrip.shellSurface,
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
            gap: 1,
            width: "max-content",
            minWidth: "100%",
            pr: 0.25,
            transform: "translate3d(var(--filmstrip-edge-offset), 0, 0)",
            transition:
              isDragging || prefersReducedMotion
                ? "none"
                : "transform 220ms cubic-bezier(0.2, 0, 0, 1)",
          }}
        >
          {renderWindow.leadingSpacerWidth > 0 ? (
            <Box
              aria-hidden
              sx={{
                flex: `0 0 ${renderWindow.leadingSpacerWidth}px`,
                width: renderWindow.leadingSpacerWidth,
              }}
            />
          ) : null}
          {visibleFrames.map((frame, windowIndex) => {
            const index = renderWindow.start + windowIndex;
            return (
              <MemoizedThumbnailButton
                key={frame.id}
                frame={frame}
                isActive={frame.id === currentFrameId}
                isNearActive={activeIndex === -1 || Math.abs(index - activeIndex) <= 8}
                onSelectFrame={handleFrameSelection}
                onFrameIntent={onFrameIntent}
              />
            );
          })}
          {renderWindow.trailingSpacerWidth > 0 ? (
            <Box
              aria-hidden
              sx={{
                flex: `0 0 ${renderWindow.trailingSpacerWidth}px`,
                width: renderWindow.trailingSpacerWidth,
              }}
            />
          ) : null}
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
            width: "100%",
            // Keep the visual rail thin while meeting a usable minimum touch target on mobile.
            height: 24,
            mt: 0.25,
            mb: 0,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            // Keep the rail in normal flow so every viewport retains space beneath it.
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
              height: 2,
              borderRadius: 999,
              backgroundColor: viewerTokens.filmstrip.scrollbarTrack,
              overflow: "visible",
              pointerEvents: "none",
            }}
          >
            <Box
              sx={{
                width: `${scrollbarMetrics.thumbWidth}px`,
                height: 4,
                mt: "-1px",
                borderRadius: 999,
                background: viewerTokens.filmstrip.scrollbarThumb,
                transform: `translate3d(${scrollbarMetrics.thumbOffset}px, 0, 0)`,
                transition:
                  isDragging || prefersReducedMotion
                    ? "none"
                    : "transform 180ms cubic-bezier(0.2, 0, 0, 1), width 180ms cubic-bezier(0.2, 0, 0, 1)",
                boxShadow: viewerTokens.filmstrip.scrollbarThumbRing,
              }}
            />
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
