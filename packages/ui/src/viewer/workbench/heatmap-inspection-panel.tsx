"use client";

import { Close, ZoomInMap } from "@mui/icons-material";
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  Typography,
} from "@mui/material";
import type { HeatmapRegion } from "@magic-compare/compare-core/heatmap";
import type { ReactNode } from "react";
import { MagicSegmentedControl } from "../../controls/magic-segmented-control";
import type { LiveHeatmapState } from "./use-live-heatmap";
import type { ViewerInteractionStore } from "./viewer-interaction-store";
import { HeatmapOpacityControls } from "./viewer-toolbar";

export type HeatmapDisplay = "map" | "overlay" | "original";

/** Expose the scale and a direct original-image check so amplified differences are not mistaken for a quality verdict. */
export function HeatmapInspectionPanel({
  state,
  gain,
  onGainChange,
  display,
  onDisplayChange,
  onInspect,
  onRetry,
  onUseStored,
  onClose,
  comparisonControls,
  stored,
  interactionStore,
}: {
  state: LiveHeatmapState;
  gain: number;
  onGainChange: (gain: number) => void;
  display: HeatmapDisplay;
  onDisplayChange: (display: HeatmapDisplay) => void;
  onInspect: (region: HeatmapRegion) => void;
  onRetry: () => void;
  onUseStored?: () => void;
  onClose: () => void;
  comparisonControls?: ReactNode;
  stored: boolean;
  interactionStore: ViewerInteractionStore;
}) {
  const summary = stored ? undefined : state.summary;
  return (
    <Stack
      component="section"
      aria-label="Heatmap"
      data-heatmap-analysis-panel=""
      spacing={1.5}
      sx={{
        p: 2.25,
        minWidth: 0,
        height: "100%",
        overflowY: "auto",
        backgroundColor: "surface.containerLow",
      }}
    >
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Stack spacing={0.15}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Heatmap
          </Typography>
        </Stack>
        <IconButton aria-label="关闭 Heatmap" onClick={onClose} size="small">
          <Close fontSize="small" />
        </IconButton>
      </Stack>
      {/* The right drawer is modal on phones, so it repeats the target switcher where it remains
          reachable instead of forcing a close-and-reopen loop before each Heatmap comparison. */}
      {comparisonControls ? (
        <Box
          sx={{
            display: { xs: "flex", sm: "none" },
            minWidth: 0,
            justifyContent: "center",
            "& > .MuiStack-root": { ml: 0 },
          }}
        >
          {comparisonControls}
        </Box>
      ) : null}
      {/* The phone drawer needs full-width controls; desktop's wrapping row leaves uneven gaps. */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        useFlexGap
        sx={{
          gap: { xs: 1.25, sm: 2 },
          flexWrap: "wrap",
          alignItems: { xs: "stretch", sm: "center" },
        }}
      >
        <MagicSegmentedControl
          size="small"
          exclusive
          value={display}
          aria-label="Heatmap 显示方式"
          onChange={(_, value: HeatmapDisplay | null) => value && onDisplayChange(value)}
          sx={{
            width: { xs: "100%", sm: "auto" },
            "& .MuiToggleButtonGroup-grouped": {
              flex: { xs: "1 1 0", sm: "0 1 auto" },
              minWidth: 0,
              px: { xs: 0.75, sm: 1.25 },
            },
          }}
        >
          <ToggleButton value="map">仅 Heatmap</ToggleButton>
          <ToggleButton value="overlay">叠加</ToggleButton>
          <ToggleButton value="original">原图</ToggleButton>
        </MagicSegmentedControl>
        {!stored && (
          <TextField
            select
            size="small"
            slotProps={{ select: { inputProps: { "aria-label": "Heatmap 灵敏度" } } }}
            value={gain}
            onChange={(event) => onGainChange(Number(event.target.value))}
            sx={{ minWidth: 110, width: { xs: "100%", sm: "auto" } }}
          >
            <MenuItem value={0.5}>保守</MenuItem>
            <MenuItem value={1}>自动</MenuItem>
            <MenuItem value={2}>增强 2×</MenuItem>
            <MenuItem value={4}>增强 4×</MenuItem>
          </TextField>
        )}
        {display === "overlay" && <HeatmapOpacityControls interactionStore={interactionStore} />}
      </Stack>
      {/* The stage owns the shared visual indicator for image loading and analysis. */}
      <Box
        role="status"
        aria-live="polite"
        aria-label={state.status === "loading" && !stored ? "正在生成 Heatmap" : undefined}
      >
        {stored ? (
          <Typography variant="body2">
            预生成 Heatmap（Deprecated）
            <Button size="small" onClick={onRetry}>
              重新分析原图
            </Button>
          </Typography>
        ) : state.status === "loading" && !summary ? null : state.status === "error" ? (
          <Stack spacing={0.5}>
            <Typography variant="body2" color="error">
              {state.error} 素材须允许跨域像素读取。
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={onRetry}>
                重试分析
              </Button>
              {onUseStored && (
                <Button size="small" onClick={onUseStored}>
                  使用预生成 Heatmap
                </Button>
              )}
            </Stack>
          </Stack>
        ) : (
          summary && (
            <Stack spacing={0.5}>
              {/* Keep the scale and its label together at a glance, even in the narrow drawer. */}
              <Stack
                direction="row"
                spacing={1.25}
                sx={{
                  alignItems: "center",
                  px: 1.5,
                  py: 1.25,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 999,
                  backgroundColor: "surface.containerHigh",
                }}
              >
                <Box
                  aria-hidden="true"
                  sx={{
                    flex: "1 1 0",
                    minWidth: 48,
                    height: 8,
                    borderRadius: 999,
                    background: "linear-gradient(90deg,#0c0e12,#2d2570,#ac2d71,#f56930,#fff5a0)",
                  }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ flexShrink: 0, whiteSpace: "nowrap", letterSpacing: "0.04em" }}
                >
                  弱 → 强
                </Typography>
              </Stack>
              {summary.regions.length ? (
                <Stack spacing={0.75}>
                  {summary.regions.map((region, index) => (
                    <Button
                      key={index}
                      variant="outlined"
                      size="small"
                      onClick={() => onInspect(region)}
                      aria-label={`检查区域 ${index + 1}`}
                      startIcon={<ZoomInMap />}
                      sx={{ justifyContent: "flex-start", minHeight: 40 }}
                    >
                      <Box component="span" sx={{ display: "grid", textAlign: "left" }}>
                        <Box component="span">查看区域 {index + 1}</Box>
                        <Typography component="span" variant="caption" color="text.secondary">
                          局部 RMS {region.score.toFixed(1)} / 255
                        </Typography>
                      </Box>
                    </Button>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2">
                  {summary.rms <= summary.noiseFloor
                    ? "未发现超过当前阈值的集中变化。"
                    : "变化较均匀，未发现明显集中的区域。"}
                </Typography>
              )}
            </Stack>
          )
        )}
      </Box>
    </Stack>
  );
}

/** Normalized source coordinates are rotated with the image, including portrait mobile stages. */
export function HeatmapRegionMarkers({
  regions,
  rotate,
  onInspect,
}: {
  regions: HeatmapRegion[];
  rotate: boolean;
  onInspect: (region: HeatmapRegion) => void;
}) {
  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        // Stage mode layers carry z-index during their crossfade. Markers are an inspection
        // affordance above those pixels, so the shared overlay must establish the higher layer.
        zIndex: 3,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {regions.map((region, index) => {
        const x = rotate ? 1 - region.y - region.height : region.x;
        const y = rotate ? region.x : region.y;
        return (
          <Box
            key={index}
            component="button"
            aria-label={`放大热点 ${index + 1}`}
            onClick={() => onInspect(region)}
            sx={{
              position: "absolute",
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${(rotate ? region.height : region.width) * 100}%`,
              height: `${(rotate ? region.width : region.height) * 100}%`,
              // Keep the outline at the measured patch size; the panel provides larger targets.
              minWidth: 0,
              minHeight: 0,
              display: "grid",
              placeItems: "start",
              p: 0.25,
              border: "2px solid #fff",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.86), 0 2px 8px rgba(0,0,0,0.52)",
              borderRadius: 0,
              backgroundColor: "rgba(0,0,0,0.38)",
              color: "#fff",
              textShadow: "0 1px 2px #000",
              pointerEvents: "auto",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {index + 1}
          </Box>
        );
      })}
    </Box>
  );
}
