"use client";

import { Button, Paper, Stack, Typography } from "@mui/material";
import { useEffect } from "react";
import { viewerTokens } from "./viewer-tokens";

const AUTO_CLOSE_DELAY_MS = 5_000;

interface PixelRenderingAutoDisableNudgeProps {
  onAutoClose: () => void;
  onDisableAutoEnable: () => void;
  onKeepAutoEnable: () => void;
}

/**
 * Keeps the automation choice local to the stage and dismisses it quickly, avoiding the body
 * scroll lock and scrollbar-width shift caused by a global modal for this lightweight decision.
 */
export function PixelRenderingAutoDisableNudge({
  onAutoClose,
  onDisableAutoEnable,
  onKeepAutoEnable,
}: PixelRenderingAutoDisableNudgeProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onAutoClose, AUTO_CLOSE_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [onAutoClose]);

  return (
    <Paper
      role="region"
      aria-label="像素渲染自动开启设置"
      aria-live="polite"
      elevation={0}
      sx={{
        width: "min(260px, calc(100% - 20px))",
        px: 1.25,
        py: 1,
        border: viewerTokens.workbench.hintBorder,
        borderRadius: 2,
        backgroundColor: viewerTokens.workbench.hintSurface,
        boxShadow: viewerTokens.workbench.hintShadow,
        backdropFilter: "blur(12px)",
      }}
    >
      <Stack spacing={0.75}>
        <Typography variant="body2" sx={{ fontWeight: 650 }}>
          250% 以上自动开启？
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ justifyContent: "flex-end" }}>
          <Button size="small" color="inherit" onClick={onKeepAutoEnable}>
            保留
          </Button>
          <Button size="small" variant="contained" onClick={onDisableAutoEnable}>
            不再自动
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
