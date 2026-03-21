"use client";

import { PhotoLibrary } from "@mui/icons-material";
import { Box, Button, Stack, Typography } from "@mui/material";
import type { ViewerFrame } from "@magic-compare/compare-core/viewer-data";
import type { DragEvent as ReactDragEvent } from "react";
import { useFilmstripDrag } from "./use-filmstrip-drag";

function resolveThumbnailAsset(frame: ViewerFrame) {
  return (
    frame.assets.find((asset) => asset.kind === "after" && asset.isPrimaryDisplay) ??
    frame.assets.find((asset) => asset.kind === "before" && asset.isPrimaryDisplay) ??
    frame.assets[0]
  );
}

function ThumbnailButton({
  frame,
  isActive,
  onClick,
}: {
  frame: ViewerFrame;
  isActive: boolean;
  onClick: () => void;
}) {
  const thumbAsset = resolveThumbnailAsset(frame);

  return (
    <Button
      data-frame-id={frame.id}
      onClick={onClick}
      sx={{
        minWidth: 168,
        maxWidth: 168,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 0.9,
        borderRadius: 2.25,
        border: "1px solid",
        borderColor: isActive ? "primary.main" : "divider",
        backgroundColor: isActive ? "rgba(232, 198, 246, 0.1)" : "rgba(255, 255, 255, 0.018)",
        boxShadow: isActive ? "inset 0 0 0 1px rgba(232, 198, 246, 0.18)" : "none",
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
          backgroundColor: "rgba(255,255,255,0.035)",
          aspectRatio: "16 / 9",
        }}
      >
        {thumbAsset ? (
          <Box
            component="img"
            src={thumbAsset.thumbUrl || thumbAsset.imageUrl}
            alt={frame.title}
            draggable={false}
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
          <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
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
  onSelectFrame: (frameId: string) => void;
}

export function ViewerFilmstrip({
  currentFrameId,
  frames,
  prefersReducedMotion,
  onSelectFrame,
}: ViewerFilmstripProps) {
  const { edgeOffset, isDragging, scrollbarMetrics, viewportHandlers, viewportRef, handleFrameSelection } =
    useFilmstripDrag({
      frameCount: frames.length,
      onSelectFrame,
      prefersReducedMotion,
    });

  return (
    <Box
      sx={{
        minWidth: 0,
        px: { xs: 1.5, md: 2.25 },
        pt: { xs: 1.35, md: 2 },
        pb: { xs: 2.1, md: 2.35 },
        borderTop: "1px solid",
        borderColor: "divider",
        backgroundColor: "rgba(255,255,255,0.014)",
        position: "relative",
      }}
    >
      <Box
        ref={viewportRef}
        {...viewportHandlers}
        onDragStart={(event: ReactDragEvent<HTMLDivElement>) => event.preventDefault()}
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
          sx={{
            display: "flex",
            gap: 1.25,
            width: "max-content",
            minWidth: "100%",
            pt: 0.35,
            pb: 0.75,
            pr: 0.25,
            transform: `translate3d(${edgeOffset}px, 0, 0)`,
            transition:
              isDragging || prefersReducedMotion
                ? "none"
                : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {frames.map((frame) => (
            <ThumbnailButton
              key={frame.id}
              frame={frame}
              isActive={frame.id === currentFrameId}
              onClick={() => handleFrameSelection(frame.id)}
            />
          ))}
        </Box>
      </Box>

      {scrollbarMetrics.visible ? (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            left: { xs: 20, md: 28 },
            right: { xs: 20, md: 28 },
            bottom: { xs: 10, md: 12 },
            height: 6,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.08)",
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <Box
            sx={{
              width: `${scrollbarMetrics.thumbWidth}px`,
              height: "100%",
              borderRadius: 999,
              background:
                "linear-gradient(90deg, rgba(232, 198, 246, 0.42) 0%, rgba(242, 235, 201, 0.5) 100%)",
              transform: `translate3d(${scrollbarMetrics.thumbOffset}px, 0, 0)`,
              transition:
                isDragging || prefersReducedMotion
                  ? "none"
                  : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), width 180ms cubic-bezier(0.22, 1, 0.36, 1)",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
            }}
          />
        </Box>
      ) : null}
    </Box>
  );
}
