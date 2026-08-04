"use client";

import { FitScreen, HelpOutlined, ViewSidebar } from "@mui/icons-material";
import { Box, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import type { ViewerMode } from "@magic-compare/content-schema";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import { AbInspectControls } from "./ab-inspect-controls";
import { ComparisonAssetControls } from "./comparison-asset-controls";

interface ViewerToolbarProps {
  abScale: number;
  abSide: "before" | "after";
  afterAsset: ViewerAsset | undefined;
  beforeAsset: ViewerAsset | undefined;
  canUseHeatmap: boolean;
  comparisonAssetKey: string | undefined;
  comparisonAssets: ViewerAsset[];
  guideOpen: boolean;
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
 * Keeps viewer controls in one small surface so mode switching and A/B inspection affordances stay
 * consistent between the internal and public shells.
 */
export function ViewerToolbar({
  abScale,
  abSide,
  afterAsset,
  beforeAsset,
  canUseHeatmap,
  comparisonAssetKey,
  comparisonAssets,
  guideOpen,
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
}: ViewerToolbarProps) {
  const compactControlHeight = { xs: 42, md: 40 };
  const compactIconButtonSize = { xs: 42, md: 40 };

  /**
   * Routes side selection through the parent controller so A/B state stays in sync with keyboard
   * shortcuts and stage tap cycling.
   */
  function handleAbSideChange(nextSide: "before" | "after") {
    onAbSideChange(nextSide);
  }

  /**
   * Clamps preset changes through the shared controller entry point so toolbar buttons and keyboard
   * shortcuts cannot diverge from stage zoom bounds.
   */
  function handleScaleChange(nextScale: number) {
    onScaleChange(nextScale);
  }

  /**
   * Ignores MUI's null deselect event because the viewer must always stay in one compare mode.
   */
  function handleModeChange(_event: unknown, nextMode: ViewerMode | null) {
    if (nextMode) {
      onModeChange(nextMode);
    }
  }

  return (
    <Stack
      spacing={0.75}
      sx={{
        alignItems: { xs: "stretch", sm: "flex-end" },
        minWidth: 0,
      }}
    >
      <Stack
        direction="row"
        useFlexGap
        sx={{
          alignItems: "center",
          justifyContent: { xs: "flex-start", sm: "flex-end" },
          flexWrap: "wrap",
          gap: 0.75,
        }}
      >
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode}
          sx={{
            flexShrink: 0,
            overflow: "visible",
            alignItems: "stretch",
            "& .MuiToggleButtonGroup-grouped": {
              // Fixed segment widths keep the utility controls stationary when the selected mode
              // or translated label changes.
              width: 72,
              height: compactControlHeight,
              minHeight: compactControlHeight,
              px: 1,
              fontSize: "0.86rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
            },
            "& .MuiToggleButtonGroup-firstButton": {
              borderRadius: "999px 4px 4px 999px",
            },
            "& .MuiToggleButtonGroup-middleButton": {
              borderRadius: 1,
            },
            "& .MuiToggleButtonGroup-lastButton": {
              borderRadius: "4px 999px 999px 4px",
            },
          }}
          onChange={handleModeChange}
        >
          <ToggleButton value="before-after">
            {variant === "internal" ? "滑动" : "Swipe"}
          </ToggleButton>
          <ToggleButton value="a-b">A / B</ToggleButton>
          <ToggleButton value="heatmap" disabled={!canUseHeatmap}>
            {variant === "internal" ? "热图" : "Heatmap"}
          </ToggleButton>
        </ToggleButtonGroup>

        <Box
          sx={{
            width: compactIconButtonSize,
            height: compactIconButtonSize,
            flex: "0 0 auto",
            // Preserve the slot when the shortcut is unnecessary so neighboring controls never
            // move after scrolling or changing stage state.
            visibility: hideStageScrollControl ? "hidden" : "visible",
          }}
        >
          <Tooltip title="滚动到对比主图">
            <IconButton
              size="small"
              aria-label="滚动到对比主图"
              onClick={onScrollStageIntoView}
              sx={{
                width: "100%",
                height: "100%",
                border: "1px solid",
                borderColor: "divider",
                backgroundColor: "surface.containerHigh",
              }}
            >
              <FitScreen fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Tooltip title="查看引导 (?)">
          <IconButton
            size="small"
            aria-label="查看引导"
            aria-pressed={guideOpen}
            color={guideOpen ? "primary" : "default"}
            onClick={onOpenGuide}
            sx={{
              width: compactIconButtonSize,
              height: compactIconButtonSize,
              "& .MuiSvgIcon-root": {
                fontSize: 18,
              },
            }}
          >
            <HelpOutlined />
          </IconButton>
        </Tooltip>

        <Tooltip title={sidebarOpen ? "关闭详情 (I)" : "打开详情 (I)"}>
          <IconButton
            size="small"
            aria-label={sidebarOpen ? "关闭详情" : "打开详情"}
            onClick={onToggleSidebar}
            sx={{
              width: compactIconButtonSize,
              height: compactIconButtonSize,
              "& .MuiSvgIcon-root": {
                fontSize: 18,
              },
            }}
          >
            <ViewSidebar />
          </IconButton>
        </Tooltip>
      </Stack>

      {beforeAsset && comparisonAssetKey && comparisonAssets.length > 1 ? (
        <Box
          sx={{
            display: "flex",
            justifyContent: { xs: "flex-start", sm: "flex-end" },
            width: "100%",
            minWidth: 0,
          }}
        >
          {/* Extra uploaded variables used to disappear after import. Keep the entire target set
              visible here so switching Rip/Flt never depends on opening the metadata drawer. */}
          <ComparisonAssetControls
            baselineAsset={beforeAsset}
            comparisonAssetKey={comparisonAssetKey}
            comparisonAssets={comparisonAssets}
            disabled={mode === "heatmap"}
            onComparisonAssetChange={onComparisonAssetChange}
          />
        </Box>
      ) : null}

      <Box
        sx={{
          display: "flex",
          justifyContent: { xs: "flex-start", sm: "flex-end" },
          width: "100%",
          minHeight: compactControlHeight,
          // A reserved second row prevents the title and mode switch from jumping when A/B tools
          // become available while keeping the inactive controls out of keyboard navigation.
          visibility: mode === "a-b" ? "visible" : "hidden",
        }}
      >
        <AbInspectControls
          abScale={abScale}
          abSide={abSide}
          afterLabel={afterAsset?.label ?? "After"}
          beforeLabel={beforeAsset?.label ?? "Before"}
          onAbSideChange={handleAbSideChange}
          onScaleChange={handleScaleChange}
        />
      </Box>
    </Stack>
  );
}
