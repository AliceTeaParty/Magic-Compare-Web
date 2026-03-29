"use client";

import { Box, Stack, Typography } from "@mui/material";
import type { ViewerMode } from "@magic-compare/content-schema";
import { ViewerToolbar } from "./viewer-toolbar";

interface ViewerHeaderProps {
  abPresetScale: number;
  abSide: "before" | "after";
  canUseHeatmap: boolean;
  caseTitle: string;
  groupTitle: string;
  hideStageScrollControl: boolean;
  mode: ViewerMode;
  onAbSideChange: (side: "before" | "after") => void;
  onModeChange: (mode: ViewerMode) => void;
  onScalePresetChange: (presetScale: number) => void;
  onScrollStageIntoView: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

/**
 * Keeps page identity and viewer controls together so the workbench header can stay stable even as
 * the stage and sidebar swap between internal and public variants.
 */
export function ViewerHeader({
  abPresetScale,
  abSide,
  canUseHeatmap,
  caseTitle,
  groupTitle,
  hideStageScrollControl,
  mode,
  onAbSideChange,
  onModeChange,
  onScalePresetChange,
  onScrollStageIntoView,
  onToggleSidebar,
  sidebarOpen,
}: ViewerHeaderProps) {
  return (
    <Box
      sx={{
        gridColumn: "1 / -1",
        position: "relative",
        zIndex: 2,
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "stretch", sm: "center" },
        justifyContent: "space-between",
        gap: 1.5,
        p: { xs: 1.75, md: 3 },
        borderBottom: "1px solid",
        borderColor: "divider",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.018) 100%)",
      }}
    >
      <Stack spacing={0.2} sx={{ minWidth: 0, pr: { sm: 2 } }}>
        <Typography
          variant="h4"
          noWrap
          sx={{
            lineHeight: 1.18,
            // padding-bottom gives descenders (p, g, y…) room before overflow:hidden
            // clips them; noWrap relies on overflow:hidden for ellipsis truncation.
            paddingBottom: "0.18em",
          }}
        >
          {groupTitle}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ mt: "0.25em", pl: "0.08em" }}
        >
          {caseTitle}
        </Typography>
      </Stack>

      <ViewerToolbar
        abPresetScale={abPresetScale}
        abSide={abSide}
        canUseHeatmap={canUseHeatmap}
        hideStageScrollControl={hideStageScrollControl}
        mode={mode}
        onAbSideChange={onAbSideChange}
        onModeChange={onModeChange}
        onScalePresetChange={onScalePresetChange}
        onScrollStageIntoView={onScrollStageIntoView}
        onToggleSidebar={onToggleSidebar}
        sidebarOpen={sidebarOpen}
      />
    </Box>
  );
}
