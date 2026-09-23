"use client";

import { BrokenImageOutlined } from "@mui/icons-material";
import { alpha, Box, Stack, Typography, useTheme } from "@mui/material";
import type { PublishImagePlaceholder } from "@magic-compare/content-schema";
import { buildStageImagePlaceholderColors } from "./stage-image-placeholder-colors";

/** Renders truthful per-image loading or failure feedback inside the stage. */
export function StageImageFallback({
  animateOpacity = true,
  contentPosition = { left: "50%", top: "50%" },
  counterRotate = false,
  errorMessage = "图片加载失败，请刷新页面后重试。",
  errored,
  imageReady,
  opacity,
  placeholder,
  prefersReducedMotion,
  processing = false,
}: {
  animateOpacity?: boolean;
  contentPosition?: { left: string; top: string };
  counterRotate?: boolean;
  errorMessage?: string;
  errored: boolean;
  imageReady: boolean;
  opacity: number;
  placeholder?: PublishImagePlaceholder;
  prefersReducedMotion: boolean;
  processing?: boolean;
}) {
  const theme = useTheme();
  const colors = placeholder
    ? buildStageImagePlaceholderColors(placeholder.sourceColor, theme.palette.mode === "dark")
    : null;
  const accentColor = colors?.accent ?? theme.palette.primary.main;
  const panelColor = colors?.panel ?? theme.palette.background.paper;
  const foregroundColor = colors?.foreground ?? theme.palette.text.secondary;
  const outlineColor = colors?.outline ?? theme.palette.divider;

  return (
    <Box
      aria-hidden={!errored}
      role={errored ? "status" : undefined}
      sx={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        // Heatmap keeps this same indicator above decoded original pixels until analysis finishes.
        // The image and worker can finish in either order, but neither starts a second animation.
        zIndex: processing ? 1 : undefined,
        opacity: imageReady && !processing && !errored ? 0 : opacity,
        display: "grid",
        placeItems: "center",
        color: foregroundColor,
        backgroundColor:
          imageReady && processing
            ? "transparent"
            : (colors?.background ?? "var(--mui-palette-surface-containerHigh)"),
        pointerEvents: "none",
        transition:
          prefersReducedMotion || !animateOpacity
            ? "none"
            : "opacity 220ms cubic-bezier(0.2, 0, 0, 1)",
      }}
    >
      {placeholder ? (
        <Box
          component="img"
          src={placeholder.dataUrl}
          alt=""
          aria-hidden="true"
          data-viewer-stage-placeholder=""
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "fill",
            imageRendering: "pixelated",
            opacity: imageReady && processing ? 0 : 1,
            transition: prefersReducedMotion ? "none" : "opacity 220ms cubic-bezier(0.2, 0, 0, 1)",
          }}
        />
      ) : null}
      {placeholder ? (
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            inset: 0,
            backgroundColor: alpha(colors?.background ?? panelColor, 0.12),
            opacity: imageReady && processing ? 0 : 1,
          }}
        />
      ) : null}
      <Stack
        data-viewer-stage-feedback=""
        spacing={errored ? 0.75 : 0}
        sx={{
          position: "absolute",
          left: contentPosition.left,
          top: contentPosition.top,
          // Portrait inspection rotates media pixels, but system feedback must stay upright in
          // screen coordinates so it remains readable without rotating the device.
          transform: counterRotate
            ? "translate(-50%, -50%) rotate(-90deg)"
            : "translate(-50%, -50%)",
          alignItems: "center",
          width: errored ? "min(80%, 320px)" : "auto",
          px: errored ? 2 : 1.25,
          py: errored ? 1.5 : 0.75,
          opacity: errored ? 1 : 0,
          textAlign: "center",
          color: foregroundColor,
          backgroundColor: alpha(panelColor, placeholder || processing ? 0.82 : 0),
          border: placeholder || processing ? "1px solid" : "none",
          borderColor: alpha(outlineColor, 0.7),
          borderRadius: 1,
          // Fast cache hits should not flash loading copy. The inline reference pixels themselves
          // remain visible immediately so slow visitors never wait on an empty stage.
          animation: errored
            ? "none"
            : prefersReducedMotion
              ? "magic-stage-placeholder-show 1ms step-end 180ms forwards"
              : "magic-stage-placeholder-enter 160ms cubic-bezier(0.16, 1, 0.3, 1) 180ms forwards",
          "@keyframes magic-stage-placeholder-enter": {
            from: { opacity: 0 },
            to: { opacity: 1 },
          },
          "@keyframes magic-stage-placeholder-show": {
            to: { opacity: 1 },
          },
        }}
      >
        {errored ? (
          <>
            <BrokenImageOutlined />
            <Typography variant="body2" color="inherit">
              {errorMessage}
            </Typography>
          </>
        ) : (
          <>
            {placeholder || processing ? (
              <Box
                sx={{
                  position: "relative",
                  width: 64,
                  height: 2,
                  overflow: "hidden",
                  borderRadius: 1,
                  backgroundColor: alpha(outlineColor, 0.65),
                }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    width: 20,
                    backgroundColor: accentColor,
                    transform: prefersReducedMotion ? "translateX(22px)" : "translateX(-20px)",
                    // The reference pixels are static; only this small compositor transform moves,
                    // avoiding a full-stage shimmer repaint on low-powered mobile devices.
                    animation: prefersReducedMotion
                      ? "none"
                      : "magic-stage-placeholder-track 1400ms cubic-bezier(0.4, 0, 0.2, 1) infinite",
                    "@keyframes magic-stage-placeholder-track": {
                      to: { transform: "translateX(64px)" },
                    },
                  }}
                />
              </Box>
            ) : null}
            {!imageReady ? (
              <Typography
                variant="caption"
                color="inherit"
                noWrap
                sx={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  opacity: 0,
                  // Network copy belongs only to the image request, not Heatmap computation.
                  animation: prefersReducedMotion
                    ? "magic-stage-slow-copy-show 1ms step-end 5s forwards"
                    : "magic-stage-slow-copy-in 160ms ease-out 5s forwards",
                  "@keyframes magic-stage-slow-copy-show": { to: { opacity: 1 } },
                  "@keyframes magic-stage-slow-copy-in": { to: { opacity: 1 } },
                }}
              >
                网络较慢
              </Typography>
            ) : null}
          </>
        )}
      </Stack>
    </Box>
  );
}
