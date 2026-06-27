"use client";

import { Button, Paper, Stack, Typography } from "@mui/material";
import { viewerTokens } from "./viewer-tokens";

interface ViewerOnboardingNudgeProps {
  onDismiss: () => void;
  onOpenGuide: () => void;
}

/**
 * Offers a first-run guide entry without blocking the inspection stage, so experienced users can
 * skip it and new users can learn the surface from the real viewer.
 */
export function ViewerOnboardingNudge({
  onDismiss,
  onOpenGuide,
}: ViewerOnboardingNudgeProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        width: "min(280px, calc(100% - 20px))",
        alignSelf: "flex-end",
        px: 1.25,
        py: 1,
        border: viewerTokens.workbench.hintBorder,
        borderRadius: 2,
        backgroundColor: viewerTokens.workbench.hintSurface,
        boxShadow: viewerTokens.workbench.hintShadow,
        backdropFilter: "blur(12px)",
      }}
    >
      <Stack spacing={1}>
        <Typography variant="body2" sx={{ fontWeight: 650 }}>
          第一次使用？查看快速引导。
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button
            size="small"
            variant="text"
            color="inherit"
            onClick={onDismiss}
            sx={{ minWidth: 56 }}
          >
            跳过
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={onOpenGuide}
            sx={{ minWidth: 56 }}
          >
            引导
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
