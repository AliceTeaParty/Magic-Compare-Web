"use client";

import { Box } from "@mui/material";

/**
 * Renders the local stage skeleton only while the selected image has no loaded pixels available.
 */
export function StageImageFallback({
  opacity,
  prefersReducedMotion,
}: {
  opacity: number;
  prefersReducedMotion: boolean;
}) {
  return (
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
          backgroundSize: "42% 100%, 100% 18%, 100% 24%, 100% 16%",
          backgroundPosition: "-60% 0, 0 18%, 0 48%, 0 78%",
          backgroundRepeat: "no-repeat",
          animation: prefersReducedMotion
            ? "none"
            : "magic-stage-skeleton-sweep 1250ms cubic-bezier(0.22, 1, 0.36, 1) infinite",
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
    />
  );
}
