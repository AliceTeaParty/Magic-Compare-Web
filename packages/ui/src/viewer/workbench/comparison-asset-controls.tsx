"use client";

import { CompareArrows, ImageOutlined } from "@mui/icons-material";
import { Box, Chip, Stack, ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import { getComparisonAssetKey } from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";

interface ComparisonAssetControlsProps {
  baselineAsset: ViewerAsset;
  comparisonAssetKey: string;
  comparisonAssets: ViewerAsset[];
  disabled: boolean;
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
  disabled,
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
            borderRadius: 2,
            "& .MuiChip-label": {
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
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
          disabled={disabled}
          aria-label="选择对比变量"
          onChange={handleComparisonAssetChange}
          sx={{
            height: { xs: 42, md: 40 },
            "& .MuiToggleButtonGroup-grouped": {
              minWidth: 72,
              maxWidth: 144,
              height: "100%",
              px: 1.25,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "0.86rem",
              fontWeight: 600,
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
