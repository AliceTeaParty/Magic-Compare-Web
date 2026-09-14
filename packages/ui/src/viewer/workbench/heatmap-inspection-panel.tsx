"use client";

import {
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { HeatmapRegion } from "@magic-compare/compare-core/heatmap";
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
  stored: boolean;
  interactionStore: ViewerInteractionStore;
}) {
  const summary = stored ? undefined : state.summary;
  return (
    <Stack
      component="section"
      aria-label="热图分析"
      spacing={1}
      sx={{
        px: { xs: 1.5, md: 2 },
        py: 1.25,
        borderBottom: "1px solid",
        borderColor: "divider",
        minWidth: 0,
      }}
    >
      <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={display}
          aria-label="热图显示方式"
          onChange={(_, value: HeatmapDisplay | null) => value && onDisplayChange(value)}
        >
          <ToggleButton value="map">仅热图</ToggleButton>
          <ToggleButton value="overlay">叠加</ToggleButton>
          <ToggleButton value="original">原图</ToggleButton>
        </ToggleButtonGroup>
        {!stored && (
          <TextField
            select
            size="small"
            label="灵敏度"
            value={gain}
            onChange={(event) => onGainChange(Number(event.target.value))}
            sx={{ minWidth: 110 }}
          >
            <MenuItem value={0.5}>保守</MenuItem>
            <MenuItem value={1}>自动</MenuItem>
            <MenuItem value={2}>增强 2×</MenuItem>
            <MenuItem value={4}>增强 4×</MenuItem>
          </TextField>
        )}
        {display === "overlay" && <HeatmapOpacityControls interactionStore={interactionStore} />}
      </Stack>
      <Box role="status" aria-live="polite">
        {stored ? (
          <Typography variant="body2">
            预生成热图 · 使用上传时的算法与色阶。
            <Button size="small" onClick={onRetry}>
              重新分析原图
            </Button>
          </Typography>
        ) : state.status === "loading" ? (
          <Typography variant="body2">正在分析两张原图… 当前显示对比原图。</Typography>
        ) : state.status === "error" ? (
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
                  使用预生成热图
                </Button>
              )}
            </Stack>
          </Stack>
        ) : (
          summary && (
            <Stack spacing={0.5}>
              <Stack
                direction="row"
                useFlexGap
                sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}
              >
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 100,
                    height: 8,
                    background: "linear-gradient(90deg,#0c0e12,#2d2570,#ac2d71,#f56930,#fff5a0)",
                  }}
                />
                <Typography variant="caption">
                  弱 → 强 · 色阶上限{" "}
                  {(
                    summary.noiseFloor +
                    summary.autoCeiling / (state.renderedGain ?? gain)
                  ).toFixed(1)}{" "}
                  / 255
                </Typography>
                <Typography variant="caption">
                  全图差异 RMS {summary.rms.toFixed(2)} / 255
                </Typography>
              </Stack>
              {state.renderedGain !== gain && (
                <Typography variant="caption">正在更新色阶…</Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                按当前帧展开细微差异，忽略 1 级以内波动。颜色表示变化强度，质量需核对原图。
              </Typography>
              {summary.regions.length ? (
                <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 0.5 }}>
                  {summary.regions.map((region, index) => (
                    <Button
                      key={index}
                      size="small"
                      onClick={() => onInspect(region)}
                      aria-label={`检查区域 ${index + 1}`}
                    >
                      区域 {index + 1} · {region.score.toFixed(1)}
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
    <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
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
              p: 0,
              border: "1px solid #fff",
              boxShadow: "0 0 0 1px #111",
              borderRadius: 0,
              background: "transparent",
              color: "#fff",
              textShadow: "0 1px 2px #000",
              pointerEvents: "auto",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {index + 1}
          </Box>
        );
      })}
    </Box>
  );
}
