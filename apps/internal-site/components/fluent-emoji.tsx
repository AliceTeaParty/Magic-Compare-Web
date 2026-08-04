"use client";

import { useId } from "react";
import { Box } from "@mui/material";

/** Renders the Microsoft Fluent Emoji file-folder artwork used by internal empty states. */
export function FluentFolderEmoji({ size = 64 }: { size?: number }) {
  const rawId = useId().replaceAll(":", "");
  const backGradient = `fluent-folder-back-${rawId}`;
  const frontGradient = `fluent-folder-front-${rawId}`;

  return (
    <Box
      component="svg"
      role="img"
      aria-label="文件夹"
      viewBox="0 0 32 32"
      sx={{ display: "block", width: size, height: size }}
    >
      <path
        d="M3.824 4.125A1.75 1.75 0 0 0 2.074 5.875v19.313a1.75 1.75 0 0 0 1.758 1.75h24.344a1.75 1.75 0 0 0 1.75-1.75V9.78a1.75 1.75 0 0 0-1.75-1.75H17.31a2 2 0 0 1-1.381-.553l-2.932-2.8a2 2 0 0 0-1.381-.552H3.824Z"
        fill={`url(#${backGradient})`}
      />
      <rect
        x="2.074"
        y="11.063"
        width="27.844"
        height="18.906"
        rx="1.75"
        fill={`url(#${frontGradient})`}
      />
      <defs>
        <linearGradient id={backGradient} x1="16" y1="4.75" x2="16" y2="26.938">
          <stop stopColor="#FFD152" />
          <stop offset="1" stopColor="#FFB83D" />
        </linearGradient>
        <linearGradient id={frontGradient} x1="16" y1="11.063" x2="16" y2="29.969">
          <stop stopColor="#FFE155" />
          <stop offset="1" stopColor="#FFB45F" />
        </linearGradient>
      </defs>
    </Box>
  );
}
