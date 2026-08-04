"use client";

import { BrokenImageOutlined } from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";

/**
 * Renders the local stage skeleton only while the selected image has no loaded pixels available.
 */
export function StageImageFallback({
  contentPosition = { left: "50%", top: "50%" },
  counterRotate = false,
  errorMessage = "素材加载失败，请检查内部素材服务。",
  errored,
  opacity,
  prefersReducedMotion,
}: {
  contentPosition?: { left: string; top: string };
  counterRotate?: boolean;
  errorMessage?: string;
  errored: boolean;
  opacity: number;
  prefersReducedMotion: boolean;
}) {
  return (
    <Box
      aria-hidden={!errored}
      role={errored ? "status" : undefined}
      sx={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        opacity,
        display: "grid",
        placeItems: "center",
        color: "text.secondary",
        backgroundColor: "var(--mui-palette-surface-containerHigh)",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          // An actual load failure is terminal for the current URL, so the progress shimmer must
          // stop instead of implying that usable pixels will eventually arrive.
          display: errored ? "none" : "block",
          backgroundImage: [
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 48%, transparent 96%)",
            "linear-gradient(90deg, rgba(255,255,255,0.12) 0 18%, transparent 18% 24%, rgba(255,255,255,0.08) 24% 52%, transparent 52% 59%, rgba(255,255,255,0.1) 59% 82%, transparent 82%)",
            "linear-gradient(90deg, rgba(255,255,255,0.08) 0 28%, transparent 28% 34%, rgba(255,255,255,0.11) 34% 64%, transparent 64% 70%, rgba(255,255,255,0.07) 70% 100%)",
            "linear-gradient(90deg, rgba(255,255,255,0.1) 0 38%, transparent 38% 45%, rgba(255,255,255,0.08) 45% 74%, transparent 74%)",
          ].join(", "),
          backgroundSize: "42% 100%, 100% 18%, 100% 24%, 100% 16%",
          backgroundPosition: "-60% 0, 0 18%, 0 48%, 0 78%",
          backgroundRepeat: "no-repeat",
          animation: prefersReducedMotion
            ? "none"
            : "magic-stage-skeleton-sweep 1250ms cubic-bezier(0.2, 0, 0, 1) infinite",
        },
        "@keyframes magic-stage-skeleton-sweep": {
          "0%": {
            backgroundPosition: "-60% 0, 0 18%, 0 48%, 0 78%",
          },
          "100%": {
            backgroundPosition: "160% 0, 0 18%, 0 48%, 0 78%",
          },
        },
      }}
    >
      {errored ? (
        <Stack
          spacing={0.75}
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
            width: "min(80%, 320px)",
            px: 2,
            textAlign: "center",
          }}
        >
          <BrokenImageOutlined />
          <Typography variant="body2" color="inherit">
            {errorMessage}
          </Typography>
        </Stack>
      ) : null}
    </Box>
  );
}
