"use client";

import { useEffect, useState, type ChangeEvent, type MouseEvent } from "react";
import { Check, DarkModeOutlined, LightModeOutlined, PaletteOutlined } from "@mui/icons-material";
import {
  Box,
  ButtonBase,
  IconButton,
  Popover,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { INTERNAL_THEME_PRESETS } from "./magic-color-tokens";
import { useInternalTheme } from "./magic-theme-provider";

/** Keeps theme controls stable during hydration while preserving the system-mode first visit. */
export function MagicThemeControls({ compact = false }: { compact?: boolean }) {
  const { mode, setMode, systemMode } = useColorScheme();
  const { seedHex, seedValue, setSeedValue } = useInternalTheme();
  const [mounted, setMounted] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const effectiveMode = mode === "system" ? systemMode : mode;
  const isDark = effectiveMode === "dark";

  useEffect(() => setMounted(true), []);

  function openPalette(event: MouseEvent<HTMLButtonElement>) {
    setAnchor(event.currentTarget);
  }

  function applyCustomColor(event: ChangeEvent<HTMLInputElement>) {
    setSeedValue(`custom:${event.target.value.toUpperCase()}`);
  }

  const modeControl = compact ? (
    <Tooltip title={isDark ? "切换为浅色" : "切换为深色"} placement="right">
      <IconButton
        aria-label={isDark ? "切换为浅色" : "切换为深色"}
        disabled={!mounted}
        onClick={() => setMode(isDark ? "light" : "dark")}
      >
        {isDark ? <LightModeOutlined /> : <DarkModeOutlined />}
      </IconButton>
    </Tooltip>
  ) : (
    <Tooltip title={isDark ? "切换为浅色" : "切换为深色"}>
      <Box sx={{ display: "inline-flex", alignItems: "center", height: 40 }}>
        <LightModeOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
        <Switch
          size="small"
          checked={mounted && isDark}
          disabled={!mounted}
          onChange={() => setMode(isDark ? "light" : "dark")}
          slotProps={{ input: { "aria-label": "切换明暗模式" } }}
          sx={{ mx: 0.25 }}
        />
        <DarkModeOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
      </Box>
    </Tooltip>
  );

  return (
    <Stack
      direction={compact ? "column" : "row"}
      sx={{
        alignItems: "center",
        flex: "0 0 auto",
        gap: compact ? 0.75 : 0.25,
        minWidth: compact ? 0 : 120,
        minHeight: 40,
      }}
    >
      {modeControl}
      <Tooltip title="主题色" placement={compact ? "right" : "bottom"}>
        <IconButton aria-label="选择主题色" onClick={openPalette}>
          <PaletteOutlined />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{
          vertical: compact ? "top" : "bottom",
          horizontal: compact ? "right" : "right",
        }}
        transformOrigin={{
          vertical: compact ? "bottom" : "top",
          horizontal: compact ? "left" : "right",
        }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: 252,
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              backgroundColor: "var(--mui-palette-surface-containerHigh)",
            },
          },
        }}
      >
        <Stack spacing={1.5}>
          <Typography variant="subtitle2">个性化主题色</Typography>
          <Stack direction="row" sx={{ gap: 1 }}>
            {INTERNAL_THEME_PRESETS.map((preset) => (
              <Tooltip key={preset.id} title={preset.label}>
                <ButtonBase
                  aria-label={`使用${preset.label}主题`}
                  onClick={() => setSeedValue(preset.id)}
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    color: "white",
                    backgroundColor: preset.hex,
                    border: "2px solid",
                    borderColor: seedValue === preset.id ? "text.primary" : "transparent",
                  }}
                >
                  {seedValue === preset.id ? <Check fontSize="small" /> : null}
                </ButtonBase>
              </Tooltip>
            ))}
            <Tooltip title="自定义颜色">
              <Box
                component="label"
                sx={{
                  position: "relative",
                  display: "grid",
                  placeItems: "center",
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  color: "white",
                  backgroundColor: seedHex,
                  border: "2px solid",
                  borderColor: seedValue.startsWith("custom:") ? "text.primary" : "transparent",
                  cursor: "pointer",
                  overflow: "hidden",
                }}
              >
                {seedValue.startsWith("custom:") ? <Check fontSize="small" /> : null}
                <Box
                  component="input"
                  type="color"
                  value={seedHex}
                  aria-label="选择自定义主题色"
                  onChange={applyCustomColor}
                  sx={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                />
              </Box>
            </Tooltip>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            颜色会生成完整的主色、辅助色和表面色阶。
          </Typography>
        </Stack>
      </Popover>
    </Stack>
  );
}
