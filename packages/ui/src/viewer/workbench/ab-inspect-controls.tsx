"use client";

import { Add, Grid4x4, Remove } from "@mui/icons-material";
import { Box, FormControl, IconButton, MenuItem, Select, Stack, Tooltip } from "@mui/material";
import {
  getComparisonAssetKey,
  VIEWER_MAX_PRESET_SCALE,
  VIEWER_MIN_PRESET_SCALE,
} from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";

const BASELINE_ASSET_VALUE = "__baseline__";

interface AbInspectControlsProps {
  abScale: number;
  abSide: "before" | "after";
  baselineAsset: ViewerAsset;
  comparisonAssetKey: string;
  comparisonAssets: ViewerAsset[];
  onAbSideChange: (side: "before" | "after") => void;
  onComparisonAssetChange: (assetKey: string) => void;
  onPixelRenderingToggle: () => void;
  onScaleChange: (nextScale: number) => void;
  pixelRenderingEnabled: boolean;
}

/**
 * Keeps the A/B-only controls together so the toolbar renders this compact inspect cluster only in
 * the mode where the side selector and zoom buttons are meaningful.
 */
export function AbInspectControls({
  abScale,
  abSide,
  baselineAsset,
  comparisonAssetKey,
  comparisonAssets,
  onAbSideChange,
  onComparisonAssetChange,
  onPixelRenderingToggle,
  onScaleChange,
  pixelRenderingEnabled,
}: AbInspectControlsProps) {
  const isAtMinScale = abScale <= VIEWER_MIN_PRESET_SCALE;
  const isAtMaxScale = abScale >= VIEWER_MAX_PRESET_SCALE;
  // Match the viewer toolbar target size so mode switching and zoom adjustment feel like one
  // control family instead of mixing desktop-tight and touch-friendly hit areas.
  const compactControlHeight = { xs: 42, md: 40 };
  const inspectControlWidth = 186;
  const selectedAssetValue = abSide === "before" ? BASELINE_ASSET_VALUE : comparisonAssetKey;

  /**
   * The internal zoom state is multiplier-based, but the UI presents it as a percentage because
   * percentages are easier to scan and avoid exposing implementation terminology.
   */
  function formatZoomPercentage(scale: number) {
    return `${Math.round(scale * 100)}%`;
  }

  /**
   * Maps one image selector onto the controller's target and A/B-side states. Selecting a target
   * changes the comparison asset before revealing its after side, while the baseline needs no
   * target mutation.
   */
  function handleAssetChange(value: unknown) {
    if (value === BASELINE_ASSET_VALUE) {
      onAbSideChange("before");
      return;
    }

    if (
      typeof value === "string" &&
      comparisonAssets.some((asset) => getComparisonAssetKey(asset) === value)
    ) {
      onComparisonAssetChange(value);
      onAbSideChange("after");
    }
  }

  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{
        alignItems: "center",
        justifyContent: "flex-end",
        flexShrink: 0,
        width: "100%",
        minWidth: 0,
        minHeight: compactControlHeight,
      }}
    >
      <Box
        sx={{
          width: { xs: "auto", sm: 128 },
          minWidth: 0,
          flex: { xs: "1 1 0", sm: "0 0 128px" },
          height: compactControlHeight,
          minHeight: compactControlHeight,
        }}
      >
        <FormControl
          size="small"
          fullWidth
          sx={{
            "& .MuiOutlinedInput-root": {
              height: compactControlHeight,
              minHeight: compactControlHeight,
              boxSizing: "border-box",
              borderRadius: 999,
              backgroundColor: "surface.containerHigh",
              // Keep the outline inside the fixed control height so its lower edge is never clipped.
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: "divider",
              },
            },
            "& .MuiSelect-select": {
              display: "flex",
              alignItems: "center",
              height: "100%",
              minHeight: "0 !important",
              boxSizing: "border-box",
              py: "0 !important",
              pl: 1.5,
              pr: 3.75,
              fontSize: "0.92rem",
              fontWeight: 550,
            },
          }}
        >
          <Select
            value={selectedAssetValue}
            onChange={(event) => handleAssetChange(event.target.value)}
            inputProps={{ "aria-label": "选择 A/B 图片" }}
          >
            {/* A single selector exposes every uploaded variable without requiring a second target
                control to remain visible beside the mode-specific A/B tools. */}
            <MenuItem value={BASELINE_ASSET_VALUE}>{baselineAsset.label}</MenuItem>
            {comparisonAssets.map((asset) => {
              const assetKey = getComparisonAssetKey(asset);
              return (
                <MenuItem key={assetKey} value={assetKey}>
                  {asset.label}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
      </Box>
      <Box
        sx={{
          width: inspectControlWidth,
          flex: `0 0 ${inspectControlWidth}px`,
          height: compactControlHeight,
          minHeight: compactControlHeight,
        }}
      >
        <Box
          sx={{
            alignItems: "center",
            width: "100%",
            height: "100%",
            display: "grid",
            // The percentage track uses its full content width instead of clipping; the two zoom
            // buttons share the recovered space while the pixel toggle keeps a stable final cell.
            gridTemplateColumns: "minmax(44px, 1fr) max-content minmax(44px, 1fr) 42px",
            overflow: "hidden",
            boxSizing: "border-box",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 999,
            backgroundColor: "surface.containerHigh",
          }}
        >
          <IconButton
            size="small"
            aria-label="缩小 A/B 视图"
            disabled={isAtMinScale}
            onClick={() =>
              onScaleChange(Math.max(VIEWER_MIN_PRESET_SCALE, Math.floor(abScale - 0.001)))
            }
            sx={{
              width: "100%",
              height: "100%",
              borderRadius: 0,
              "&.Mui-disabled": {
                color: "text.disabled",
                backgroundColor: "transparent",
              },
            }}
          >
            <Remove sx={{ fontSize: 16 }} />
          </IconButton>
          <Box
            sx={{
              height: "100%",
              minWidth: "max-content",
              minHeight: 0,
              px: 0.5,
              display: "grid",
              placeItems: "center",
              fontSize: "0.9rem",
              fontWeight: 550,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              overflow: "visible",
            }}
          >
            {formatZoomPercentage(abScale)}
          </Box>
          <IconButton
            size="small"
            aria-label="放大 A/B 视图"
            disabled={isAtMaxScale}
            onClick={() =>
              onScaleChange(Math.min(VIEWER_MAX_PRESET_SCALE, Math.ceil(abScale + 0.001)))
            }
            sx={{
              width: "100%",
              height: "100%",
              borderRadius: 0,
              "&.Mui-disabled": {
                color: "text.disabled",
                backgroundColor: "transparent",
              },
            }}
          >
            <Add sx={{ fontSize: 16 }} />
          </IconButton>
          <Tooltip title={pixelRenderingEnabled ? "关闭像素渲染" : "开启像素渲染"}>
            <IconButton
              size="small"
              aria-label={pixelRenderingEnabled ? "关闭 A/B 像素渲染" : "开启 A/B 像素渲染"}
              aria-pressed={pixelRenderingEnabled}
              onClick={onPixelRenderingToggle}
              sx={{
                width: "100%",
                height: "100%",
                borderLeft: "1px solid",
                borderLeftColor: "divider",
                borderRadius: 0,
                "&[aria-pressed='true']": {
                  color: "primary.onContainer",
                  backgroundColor: "primary.light",
                },
              }}
            >
              {/* Grid4x4 reads as image pixels at toolbar size; GridOn resembled a data table. */}
              <Grid4x4 sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Stack>
  );
}
