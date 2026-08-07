"use client";

import { useEffect, useRef } from "react";
import { FitScreen, HelpOutlined, Opacity, ViewSidebar } from "@mui/icons-material";
import {
  Box,
  IconButton,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ViewerMode } from "@magic-compare/content-schema";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import { clampNumber } from "@magic-compare/shared-utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AbInspectControls } from "./ab-inspect-controls";
import { ComparisonAssetControls } from "./comparison-asset-controls";

const compactControlHeight = { xs: 42, md: 40 } as const;
const tripleControlWidth = 144;
const MODE_ORDER: Record<ViewerMode, number> = { "before-after": 0, "a-b": 1, heatmap: 2 };
// Site variants describe capabilities, not locale. The previous variant branches made the same
// Chinese viewer switch to English labels after public export, so both surfaces share one copy set.
const VIEWER_CONTROL_COPY = {
  heatmap: "热图",
  heatmapOpacity: "热图透明度",
  opacity: "透明度",
  swipe: "滑动",
  tools: "视图工具",
} as const;

interface ViewerUtilityControlsProps {
  compact?: boolean;
  guideOpen: boolean;
  hideStageScrollControl: boolean;
  onOpenGuide: () => void;
  onScrollStageIntoView: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

interface ViewerToolbarProps {
  abScale: number;
  abSide: "before" | "after";
  beforeAsset: ViewerAsset | undefined;
  canUseHeatmap: boolean;
  comparisonAssetKey: string | undefined;
  comparisonAssets: ViewerAsset[];
  guideOpen: boolean;
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

/** Keeps Heatmap intensity inside the stable toolbar slot instead of moving the filmstrip. */
function HeatmapOpacityControls({
  onChange,
  value,
}: {
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <Stack
      direction="row"
      sx={{
        // Heatmap uses the same fixed-height tonal surface as the Viewer segmented controls, so
        // switching modes changes content without introducing a visually unrelated bare slider.
        width: "min(100%, 240px)",
        height: compactControlHeight,
        minHeight: compactControlHeight,
        alignItems: "center",
        gap: 0.75,
        px: 1.25,
        boxSizing: "border-box",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 999,
        backgroundColor: "surface.containerHigh",
      }}
    >
      <Opacity aria-hidden="true" sx={{ color: "text.secondary", fontSize: 18 }} />
      <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
        {VIEWER_CONTROL_COPY.opacity}
      </Typography>
      <Slider
        aria-label={VIEWER_CONTROL_COPY.heatmapOpacity}
        min={20}
        max={95}
        size="small"
        value={value}
        onChange={(_, nextValue) =>
          onChange(clampNumber(Array.isArray(nextValue) ? nextValue[0] : nextValue, 20, 95))
        }
        sx={{ flex: 1, minWidth: 64 }}
      />
      <Typography
        variant="caption"
        sx={{ width: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
      >
        {value}%
      </Typography>
    </Stack>
  );
}

/** Renders one stable icon group that can move between the desktop toolbar and mobile title row. */
export function ViewerUtilityControls({
  compact = false,
  guideOpen,
  hideStageScrollControl,
  onOpenGuide,
  onScrollStageIntoView,
  onToggleSidebar,
  sidebarOpen,
}: ViewerUtilityControlsProps) {
  const stageControlHidden = compact || hideStageScrollControl;
  const controlWidth = compact ? 80 : stageControlHidden ? 96 : tripleControlWidth;
  const controlHeight = compact ? 40 : compactControlHeight;
  const utilityIconButtonSx = {
    width: "100%",
    height: "100%",
    border: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    "&[aria-pressed='true']": {
      color: "primary.onContainer",
      backgroundColor: "primary.light",
    },
  } as const;

  return (
    <Stack
      role="toolbar"
      aria-label={VIEWER_CONTROL_COPY.tools}
      direction="row"
      useFlexGap
      sx={{
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 0,
        width: controlWidth,
        height: controlHeight,
        flex: "0 0 auto",
        overflow: "hidden",
        boxSizing: "border-box",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 999,
        backgroundColor: "surface.containerHigh",
        // Mobile removes the stage shortcut and keeps two compact 40px cells beside the title.
        display: "grid",
        gridTemplateColumns: stageControlHidden
          ? "repeat(2, minmax(0, 1fr))"
          : "repeat(3, minmax(0, 1fr))",
      }}
    >
      {!stageControlHidden ? (
        <Box sx={{ width: "100%", height: "100%" }}>
          <Tooltip title="滚动到对比主图">
            <IconButton
              size="small"
              aria-label="滚动到对比主图"
              onClick={onScrollStageIntoView}
              sx={utilityIconButtonSx}
            >
              <FitScreen fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ) : null}

      <Tooltip title="查看引导 (?)">
        <IconButton
          size="small"
          aria-label="查看引导"
          aria-pressed={guideOpen}
          onClick={onOpenGuide}
          sx={{
            ...utilityIconButtonSx,
            borderLeft: stageControlHidden ? 0 : "1px solid",
            borderLeftColor: "divider",
            "& .MuiSvgIcon-root": { fontSize: 18 },
          }}
        >
          <HelpOutlined />
        </IconButton>
      </Tooltip>

      <Tooltip title={sidebarOpen ? "关闭详情 (I)" : "打开详情 (I)"}>
        <IconButton
          size="small"
          aria-label={sidebarOpen ? "关闭详情" : "打开详情"}
          aria-pressed={sidebarOpen}
          onClick={onToggleSidebar}
          sx={{
            ...utilityIconButtonSx,
            borderLeft: "1px solid",
            borderLeftColor: "divider",
            "& .MuiSvgIcon-root": { fontSize: 18 },
          }}
        >
          <ViewSidebar />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

/**
 * Keeps viewer controls in one small surface so mode switching and A/B inspection affordances stay
 * consistent between the internal and public shells.
 */
export function ViewerToolbar({
  abScale,
  abSide,
  beforeAsset,
  canUseHeatmap,
  comparisonAssetKey,
  comparisonAssets,
  guideOpen,
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
}: ViewerToolbarProps) {
  const prefersReducedMotion = useReducedMotion();
  const previousModeRef = useRef(mode);
  const modeDirection = MODE_ORDER[mode] >= MODE_ORDER[previousModeRef.current] ? 1 : -1;

  useEffect(() => {
    previousModeRef.current = mode;
  }, [mode]);

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
        width: { xs: "100%", sm: 366 },
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      <Stack
        direction="row"
        useFlexGap
        sx={{
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 0.75,
          width: "100%",
          minWidth: 0,
        }}
      >
        <Box sx={{ display: { xs: "none", sm: "block" }, flex: "0 0 auto" }}>
          <ViewerUtilityControls
            guideOpen={guideOpen}
            hideStageScrollControl={hideStageScrollControl}
            onOpenGuide={onOpenGuide}
            onScrollStageIntoView={onScrollStageIntoView}
            onToggleSidebar={onToggleSidebar}
            sidebarOpen={sidebarOpen}
          />
        </Box>

        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode}
          sx={{
            flexShrink: 0,
            width: { xs: "100%", sm: 216 },
            height: compactControlHeight,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 0,
            overflow: "hidden",
            alignItems: "stretch",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 999,
            backgroundColor: "surface.containerHigh",
            "& .MuiToggleButtonGroup-grouped": {
              // Fixed segment widths keep the utility controls stationary when the selected mode
              // or translated label changes. Mobile segments share the available row so icon
              // utilities never get clipped against the Viewer shell.
              width: "auto",
              minWidth: 0,
              flex: "none",
              height: "100%",
              minHeight: 0,
              px: 1,
              fontSize: "0.86rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
              margin: "0 !important",
              border: "0 !important",
              borderRadius: "0 !important",
              backgroundColor: "transparent",
            },
            "& .MuiToggleButtonGroup-grouped:not(:first-of-type)": {
              borderLeft: "1px solid !important",
              borderLeftColor: "var(--mui-palette-divider) !important",
            },
            "& .MuiToggleButton-root.Mui-selected": {
              color: "primary.onContainer",
              backgroundColor: "primary.light",
            },
            "& .MuiToggleButton-root.Mui-selected:hover": {
              backgroundColor:
                "color-mix(in srgb, currentColor 8%, var(--mui-palette-primary-light))",
            },
          }}
          onChange={handleModeChange}
        >
          <ToggleButton value="before-after">{VIEWER_CONTROL_COPY.swipe}</ToggleButton>
          <ToggleButton value="a-b">A / B</ToggleButton>
          <ToggleButton value="heatmap" disabled={!canUseHeatmap}>
            {VIEWER_CONTROL_COPY.heatmap}
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Box
        sx={{
          position: "relative",
          width: "100%",
          minWidth: 0,
          height: compactControlHeight,
          minHeight: compactControlHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          // Only the active mode owns this row, preventing unrelated controls from scattering
          // between the title and the right edge of the header. The fixed slot also lets outgoing
          // and incoming mode tools transition without moving the header or stage.
        }}
      >
        <AnimatePresence initial={false} mode="wait">
          <Box
            key={mode}
            component={motion.div}
            data-viewer-contextual-controls={mode}
            initial={
              prefersReducedMotion
                ? false
                : {
                    opacity: 0,
                    x: modeDirection * 10,
                    clipPath:
                      modeDirection > 0
                        ? "inset(0 0 0 12% round 999px)"
                        : "inset(0 12% 0 0 round 999px)",
                  }
            }
            animate={{ opacity: 1, x: 0, clipPath: "inset(0 0 0 0 round 999px)" }}
            exit={
              prefersReducedMotion
                ? { opacity: 1 }
                : {
                    opacity: 0,
                    x: modeDirection * -6,
                    clipPath:
                      modeDirection > 0
                        ? "inset(0 12% 0 0 round 999px)"
                        : "inset(0 0 0 12% round 999px)",
                    transition: { duration: 0.1, ease: [0.3, 0, 1, 1] },
                  }
            }
            transition={
              prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: [0.2, 0, 0, 1] }
            }
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              minWidth: 0,
            }}
          >
            {mode === "before-after" ? (
              beforeAsset && comparisonAssetKey && comparisonAssets.length > 0 ? (
                <ComparisonAssetControls
                  baselineAsset={beforeAsset}
                  comparisonAssetKey={comparisonAssetKey}
                  comparisonAssets={comparisonAssets}
                  onComparisonAssetChange={onComparisonAssetChange}
                />
              ) : null
            ) : mode === "a-b" ? (
              beforeAsset && comparisonAssetKey && comparisonAssets.length > 0 ? (
                <AbInspectControls
                  abScale={abScale}
                  abSide={abSide}
                  baselineAsset={beforeAsset}
                  comparisonAssetKey={comparisonAssetKey}
                  comparisonAssets={comparisonAssets}
                  onAbSideChange={handleAbSideChange}
                  onComparisonAssetChange={onComparisonAssetChange}
                  onScaleChange={handleScaleChange}
                />
              ) : null
            ) : (
              <HeatmapOpacityControls onChange={onOverlayOpacityChange} value={overlayOpacity} />
            )}
          </Box>
        </AnimatePresence>
      </Box>
    </Stack>
  );
}
