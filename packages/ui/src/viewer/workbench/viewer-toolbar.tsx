"use client";

import { FitScreen, HelpOutline, ViewSidebar } from "@mui/icons-material";
import { IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import type { ViewerMode } from "@magic-compare/content-schema";
import { AbInspectControls } from "./ab-inspect-controls";

interface ViewerToolbarProps {
  abScale: number;
  abSide: "before" | "after";
  canUseHeatmap: boolean;
  guideOpen: boolean;
  hideStageScrollControl: boolean;
  mode: ViewerMode;
  onAbSideChange: (side: "before" | "after") => void;
  onOpenGuide: () => void;
  onModeChange: (mode: ViewerMode) => void;
  onScaleChange: (nextScale: number) => void;
  onScrollStageIntoView: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

/**
 * Keeps viewer controls in one small surface so mode switching and A/B inspection affordances stay
 * consistent between the internal and public shells.
 */
export function ViewerToolbar({
  abScale,
  abSide,
  canUseHeatmap,
  guideOpen,
  hideStageScrollControl,
  mode,
  onAbSideChange,
  onOpenGuide,
  onModeChange,
  onScaleChange,
  onScrollStageIntoView,
  onToggleSidebar,
  sidebarOpen,
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
      direction="row"
      spacing={1}
      alignItems="center"
      justifyContent={{ xs: "flex-start", sm: "flex-end" }}
      flexWrap="wrap"
      useFlexGap
    >
      {mode === "a-b" ? (
        <AbInspectControls
          abScale={abScale}
          abSide={abSide}
          onAbSideChange={handleAbSideChange}
          onScaleChange={handleScaleChange}
        />
      ) : null}

      <ToggleButtonGroup
        exclusive
        size="small"
        value={mode}
        sx={{
          overflow: "visible",
          alignItems: "stretch",
          "& .MuiToggleButtonGroup-grouped": {
            // Mode switching is a primary touch action in the viewer, so it needs a larger target
            // than the older desktop-first 34px sizing.
            height: compactControlHeight,
            minHeight: compactControlHeight,
            px: 1.3,
            fontWeight: 550,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "999px !important",
            fontSize: "0.92rem",
          },
          "& .MuiToggleButtonGroup-grouped:not(:first-of-type)": {
            marginLeft: "0 !important",
            borderLeft: "1px solid",
            borderLeftColor: "divider",
          },
          "& .MuiToggleButtonGroup-grouped.Mui-selected": {
            borderColor: "rgba(200, 161, 111, 0.45)",
          },
          "& .MuiToggleButtonGroup-grouped.Mui-disabled": {
            borderColor: "divider",
          },
        }}
        onChange={handleModeChange}
      >
        <ToggleButton value="before-after">Swipe</ToggleButton>
        <ToggleButton value="a-b">A / B</ToggleButton>
        <ToggleButton value="heatmap" disabled={!canUseHeatmap}>
          Heatmap
        </ToggleButton>
      </ToggleButtonGroup>

      {!hideStageScrollControl ? (
        <Tooltip title="滚动到对比主图">
          <IconButton
            size="small"
            aria-label="滚动到对比主图"
            onClick={onScrollStageIntoView}
            sx={{
              width: compactIconButtonSize,
              height: compactIconButtonSize,
              borderColor: "divider",
              backgroundColor: "rgba(255,255,255,0.035)",
            }}
          >
            <FitScreen fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}

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
          <HelpOutline />
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
  );
}
