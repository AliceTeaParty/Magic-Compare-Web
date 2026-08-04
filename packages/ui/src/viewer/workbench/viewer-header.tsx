"use client";

import { ArrowBack } from "@mui/icons-material";
import { Box, Button, Stack, Typography } from "@mui/material";
import type { ViewerMode } from "@magic-compare/content-schema";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import Link from "next/link";
import { ViewerToolbar } from "./viewer-toolbar";

interface ViewerHeaderProps {
  abScale: number;
  abSide: "before" | "after";
  afterAsset: ViewerAsset | undefined;
  beforeAsset: ViewerAsset | undefined;
  canUseHeatmap: boolean;
  caseTitle: string;
  caseSlug: string;
  comparisonAssetKey: string | undefined;
  comparisonAssets: ViewerAsset[];
  guideOpen: boolean;
  groupTitle: string;
  hideStageScrollControl: boolean;
  mode: ViewerMode;
  onAbSideChange: (side: "before" | "after") => void;
  onComparisonAssetChange: (assetKey: string) => void;
  onOpenGuide: () => void;
  onModeChange: (mode: ViewerMode) => void;
  onScaleChange: (nextScale: number) => void;
  onScrollStageIntoView: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  variant: "public" | "internal";
}

/**
 * Keeps page identity and viewer controls together so the workbench header can stay stable even as
 * the stage and sidebar swap between internal and public variants.
 */
export function ViewerHeader({
  abScale,
  abSide,
  afterAsset,
  beforeAsset,
  canUseHeatmap,
  caseTitle,
  caseSlug,
  comparisonAssetKey,
  comparisonAssets,
  guideOpen,
  groupTitle,
  hideStageScrollControl,
  mode,
  onAbSideChange,
  onComparisonAssetChange,
  onOpenGuide,
  onModeChange,
  onScaleChange,
  onScrollStageIntoView,
  onToggleSidebar,
  sidebarOpen,
  variant,
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
        backgroundColor:
          variant === "internal" ? "var(--mui-palette-surface-container)" : undefined,
        background:
          variant === "public"
            ? "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.018) 100%)"
            : undefined,
      }}
    >
      <Stack direction="row" sx={{ minWidth: 0, alignItems: "center", gap: 1 }}>
        {variant === "internal" ? (
          <Button
            component={Link}
            href={`/cases/${caseSlug}`}
            variant="text"
            startIcon={<ArrowBack />}
            sx={{ flex: "0 0 auto", color: "text.secondary" }}
          >
            工作区
          </Button>
        ) : null}
        <Stack spacing={0.2} sx={{ minWidth: 0, pr: { sm: 2 } }}>
          <Typography
            variant={variant === "internal" ? "h5" : "h4"}
            noWrap
            sx={{
              lineHeight: 1.18,
              // padding-bottom gives descenders (p, g, y...) room before overflow:hidden
              // clips them; noWrap relies on overflow:hidden for ellipsis truncation.
              paddingBottom: "0.18em",
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
            }}
          >
            {caseTitle}
          </Typography>
        </Stack>
      </Stack>

      <ViewerToolbar
        abScale={abScale}
        abSide={abSide}
        afterAsset={afterAsset}
        beforeAsset={beforeAsset}
        canUseHeatmap={canUseHeatmap}
        comparisonAssetKey={comparisonAssetKey}
        comparisonAssets={comparisonAssets}
        guideOpen={guideOpen}
        hideStageScrollControl={hideStageScrollControl}
        mode={mode}
        onAbSideChange={onAbSideChange}
        onComparisonAssetChange={onComparisonAssetChange}
        onOpenGuide={onOpenGuide}
        onModeChange={onModeChange}
        onScaleChange={onScaleChange}
        onScrollStageIntoView={onScrollStageIntoView}
        onToggleSidebar={onToggleSidebar}
        sidebarOpen={sidebarOpen}
        variant={variant}
      />
    </Box>
  );
}
