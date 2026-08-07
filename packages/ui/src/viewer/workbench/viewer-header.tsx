"use client";

import { Box, Stack, Typography } from "@mui/material";
import type { ViewerMode } from "@magic-compare/content-schema";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import { ViewerToolbar, ViewerUtilityControls } from "./viewer-toolbar";

interface ViewerHeaderProps {
  abScale: number;
  abSide: "before" | "after";
  beforeAsset: ViewerAsset | undefined;
  canUseHeatmap: boolean;
  caseTitle: string;
  comparisonAssetKey: string | undefined;
  comparisonAssets: ViewerAsset[];
  guideOpen: boolean;
  groupTitle: string;
  hideStageScrollControl: boolean;
  mode: ViewerMode;
  overlayOpacity: number;
  onAbSideChange: (side: "before" | "after") => void;
  onComparisonAssetChange: (assetKey: string) => void;
  onOpenGuide: () => void;
  onModeChange: (mode: ViewerMode) => void;
  onOverlayOpacityChange: (value: number) => void;
  onScaleChange: (nextScale: number) => void;
  onScrollStageIntoView: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

/**
 * Keeps page identity and viewer controls together so the workbench header can stay stable even as
 * the stage and sidebar swap between internal and public variants.
 */
export function ViewerHeader({
  abScale,
  abSide,
  beforeAsset,
  canUseHeatmap,
  caseTitle,
  comparisonAssetKey,
  comparisonAssets,
  guideOpen,
  groupTitle,
  hideStageScrollControl,
  mode,
  overlayOpacity,
  onAbSideChange,
  onComparisonAssetChange,
  onOpenGuide,
  onModeChange,
  onOverlayOpacityChange,
  onScaleChange,
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
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "stretch", sm: "center" },
        justifyContent: "space-between",
        gap: { xs: 1, md: 2 },
        minHeight: { md: 112 },
        px: { xs: 1.5, md: 3 },
        // The desktop header shares the catalog/workspace divider coordinate. Two compact toolbar
        // rows fit inside this height in both viewers; public used to carry a taller legacy banner.
        py: { xs: 1.75, md: 1.5 },
        borderBottom: "1px solid",
        borderColor: "divider",
        backgroundColor: "var(--mui-palette-surface-container)",
      }}
    >
      <Stack
        direction="row"
        sx={{
          // A zero flex basis makes the identity column consume only the toolbar's remaining
          // width. Long titles then ellipsize instead of expanding the desktop header track.
          width: { xs: "100%", sm: 0 },
          minWidth: 0,
          flex: "1 1 0%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 0.75,
        }}
      >
        {/* The persistent app rail owns Case-level navigation, leaving this header to identify the
            active Group without duplicating a back action or shifting the title baseline. */}
        <Stack
          spacing={0.2}
          sx={{
            width: "100%",
            minWidth: 0,
            flex: "1 1 auto",
            overflow: "hidden",
            pr: { sm: 2 },
          }}
        >
          <Typography
            variant="h5"
            noWrap
            sx={{
              lineHeight: 1.18,
              // padding-bottom gives descenders (p, g, y...) room before overflow:hidden
              // clips them; noWrap relies on overflow:hidden for ellipsis truncation.
              paddingBottom: "0.18em",
              display: "block",
              width: "100%",
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {groupTitle}
          </Typography>
          <Typography
            variant="body2"
            noWrap
            sx={{
              color: "text.secondary",
              mt: "0.25em",
              pl: "0.08em",
              display: "block",
              width: "100%",
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {caseTitle}
          </Typography>
        </Stack>
        <Box sx={{ display: { xs: "block", sm: "none" }, flex: "0 0 auto" }}>
          {/* Mobile keeps only the two persistent utilities beside the ellipsized page identity;
              the stage shortcut remains available in the desktop three-button group. */}
          <ViewerUtilityControls
            compact
            guideOpen={guideOpen}
            hideStageScrollControl
            onOpenGuide={onOpenGuide}
            onScrollStageIntoView={onScrollStageIntoView}
            onToggleSidebar={onToggleSidebar}
            sidebarOpen={sidebarOpen}
          />
        </Box>
      </Stack>

      <ViewerToolbar
        abScale={abScale}
        abSide={abSide}
        beforeAsset={beforeAsset}
        canUseHeatmap={canUseHeatmap}
        comparisonAssetKey={comparisonAssetKey}
        comparisonAssets={comparisonAssets}
        guideOpen={guideOpen}
        hideStageScrollControl={hideStageScrollControl}
        mode={mode}
        overlayOpacity={overlayOpacity}
        onAbSideChange={onAbSideChange}
        onComparisonAssetChange={onComparisonAssetChange}
        onOpenGuide={onOpenGuide}
        onModeChange={onModeChange}
        onOverlayOpacityChange={onOverlayOpacityChange}
        onScaleChange={onScaleChange}
        onScrollStageIntoView={onScrollStageIntoView}
        onToggleSidebar={onToggleSidebar}
        sidebarOpen={sidebarOpen}
      />
    </Box>
  );
}
