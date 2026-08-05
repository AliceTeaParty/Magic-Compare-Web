"use client";

import { CompareArrows, ImageOutlined } from "@mui/icons-material";
import { Box, Chip, Stack, ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import { getComparisonAssetKey } from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";

interface ComparisonAssetControlsProps {
  baselineAsset: ViewerAsset;
  comparisonAssetKey: string;
  comparisonAssets: ViewerAsset[];
  onComparisonAssetChange: (assetKey: string) => void;
}

/**
 * Keeps every uploaded comparison variable visible in one stable row. The baseline remains fixed
 * while the segmented targets switch the right-hand image used by Swipe and A/B modes.
 */
export function ComparisonAssetControls({
  baselineAsset,
  comparisonAssetKey,
  comparisonAssets,
  onComparisonAssetChange,
}: ComparisonAssetControlsProps) {
  /** MUI exclusive groups can emit null when re-clicking the active segment; retain a valid target. */
  function handleComparisonAssetChange(_event: unknown, nextAssetKey: string | null) {
    if (nextAssetKey) {
      onComparisonAssetChange(nextAssetKey);
    }
  }

  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{
        alignItems: "center",
        // The contextual row is right-aligned in every mode. Taking the full mobile width made
        // Swipe's compact Src ↔ target cluster appear left-aligned while A/B and Heatmap stayed right.
        width: "fit-content",
        ml: "auto",
        minWidth: 0,
        maxWidth: "100%",
        overflowX: "auto",
        scrollbarWidth: "thin",
      }}
    >
      <Tooltip title={`基准变量：${baselineAsset.label}`}>
        <Chip
          icon={<ImageOutlined />}
          label={baselineAsset.label}
          variant="outlined"
          sx={{
            flex: "0 0 auto",
            height: { xs: 42, md: 40 },
            maxWidth: 144,
            borderRadius: 999,
            borderColor: "divider",
            backgroundColor: "surface.containerHigh",
            "& .MuiChip-label": {
              fontWeight: 550,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
            "& .MuiChip-icon": {
              color: "text.secondary",
            },
          }}
        />
      </Tooltip>

      <CompareArrows
        aria-hidden="true"
        sx={{ flex: "0 0 auto", color: "text.secondary", fontSize: 19 }}
      />

      <Box sx={{ minWidth: 0, flex: "0 0 auto" }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={comparisonAssetKey}
          aria-label="选择对比变量"
          onChange={handleComparisonAssetChange}
          sx={{
            height: { xs: 42, md: 40 },
            overflow: "hidden",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 999,
            backgroundColor: "surface.containerHigh",
            "& .MuiToggleButtonGroup-grouped": {
              // One outer pill and flat equal segments match the Viewer mode control.
              minWidth: 72,
              maxWidth: 144,
              height: "100%",
              px: 1.25,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "0.86rem",
              fontWeight: 600,
              margin: "0 !important",
              border: "0 !important",
              borderRadius: "0 !important",
              backgroundColor: "transparent",
            },
            "& .MuiToggleButtonGroup-grouped:not(:first-of-type)": {
              borderLeft: "1px solid !important",
              borderLeftColor: "var(--mui-palette-divider) !important",
            },
            // Viewer segmented controls use the same theme-seed container pair as the active rail
            // destination instead of falling back to the old dark secondary fill.
            "& .MuiToggleButton-root.Mui-selected": {
              color: "primary.onContainer",
              backgroundColor: "primary.light",
            },
            "& .MuiToggleButton-root.Mui-selected:hover": {
              backgroundColor:
                "color-mix(in srgb, currentColor 8%, var(--mui-palette-primary-light))",
            },
          }}
        >
          {comparisonAssets.map((asset) => {
            const assetKey = getComparisonAssetKey(asset);
            return (
              <ToggleButton
                key={assetKey}
                value={assetKey}
                aria-label={`使用 ${asset.label} 作为对比变量`}
                title={asset.label}
              >
                {asset.label}
              </ToggleButton>
            );
          })}
        </ToggleButtonGroup>
      </Box>
    </Stack>
  );
}
