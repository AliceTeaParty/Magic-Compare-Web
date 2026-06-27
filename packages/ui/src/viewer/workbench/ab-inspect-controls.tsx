"use client";

import { Add, Remove } from "@mui/icons-material";
import { Box, FormControl, IconButton, MenuItem, Select, Stack } from "@mui/material";
import {
  VIEWER_MAX_PRESET_SCALE,
  VIEWER_MIN_PRESET_SCALE,
} from "@magic-compare/compare-core";
import { viewerTokens } from "./viewer-tokens";

interface AbInspectControlsProps {
  abScale: number;
  abSide: "before" | "after";
  onAbSideChange: (side: "before" | "after") => void;
  onScaleChange: (nextScale: number) => void;
}

/**
 * Keeps the A/B-only controls together so the toolbar renders this compact inspect cluster only in
 * the mode where the side selector and zoom buttons are meaningful.
 */
export function AbInspectControls({
  abScale,
  abSide,
  onAbSideChange,
  onScaleChange,
}: AbInspectControlsProps) {
  const isAtMinScale = abScale <= VIEWER_MIN_PRESET_SCALE;
  const isAtMaxScale = abScale >= VIEWER_MAX_PRESET_SCALE;
  // Match the viewer toolbar target size so mode switching and zoom adjustment feel like one
  // control family instead of mixing desktop-tight and touch-friendly hit areas.
  const compactControlHeight = { xs: 42, md: 40 };
  const compactIconButtonSize = { xs: 42, md: 40 };

  /**
   * The internal zoom state is multiplier-based, but the UI presents it as a percentage because
   * percentages are easier to scan and avoid exposing implementation terminology.
   */
  function formatZoomPercentage(scale: number) {
    return `${Math.round(scale * 100)}%`;
  }

  /**
   * MUI Select values arrive as strings at runtime, so keep the union guard explicit instead of
   * relying on a cast that would hide a future option mismatch.
   */
  function handleAbSideChange(value: unknown) {
    if (value === "before" || value === "after") {
      onAbSideChange(value);
    }
  }

  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{
        flexShrink: 0,
        minHeight: compactControlHeight,
      }}
    >
      <Box
        sx={{
          width: 104,
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
            },
            "& .MuiSelect-select": {
              display: "flex",
              alignItems: "center",
              minHeight: { xs: "42px !important", md: "40px !important" },
              py: "0 !important",
              pl: 1.5,
              pr: 3.75,
              fontSize: "0.92rem",
              fontWeight: 550,
            },
          }}
        >
          <Select
            value={abSide}
            onChange={(event) => handleAbSideChange(event.target.value)}
            inputProps={{ "aria-label": "选择 A/B 侧" }}
          >
            <MenuItem value="before">Before</MenuItem>
            <MenuItem value="after">After</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <Box
        sx={{
          width: 168,
          minHeight: compactControlHeight,
        }}
      >
        <Stack
          direction="row"
          spacing={0.65}
          alignItems="center"
          sx={{
            width: "100%",
          }}
        >
          <IconButton
            size="small"
            aria-label="缩小 A/B 视图"
            disabled={isAtMinScale}
            onClick={() =>
              onScaleChange(
                Math.max(VIEWER_MIN_PRESET_SCALE, Math.floor(abScale - 0.001)),
              )
            }
            sx={{
              width: compactIconButtonSize,
              height: compactIconButtonSize,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 999,
              "&.Mui-disabled": {
                color: "text.disabled",
                borderColor: viewerTokens.control.disabledBorder,
                backgroundColor: viewerTokens.control.disabledSurface,
              },
            }}
          >
            <Remove sx={{ fontSize: 16 }} />
          </IconButton>
          <Box
            sx={{
              flex: 1,
              height: compactControlHeight,
              minHeight: compactControlHeight,
              px: 1.1,
              display: "grid",
              placeItems: "center",
              fontSize: "0.9rem",
              fontWeight: 550,
              borderRadius: 999,
              whiteSpace: "nowrap",
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            {formatZoomPercentage(abScale)}
          </Box>
          <IconButton
            size="small"
            aria-label="放大 A/B 视图"
            disabled={isAtMaxScale}
            onClick={() =>
              onScaleChange(
                Math.min(VIEWER_MAX_PRESET_SCALE, Math.ceil(abScale + 0.001)),
              )
            }
            sx={{
              width: compactIconButtonSize,
              height: compactIconButtonSize,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 999,
              "&.Mui-disabled": {
                color: "text.disabled",
                borderColor: viewerTokens.control.disabledBorder,
                backgroundColor: viewerTokens.control.disabledSurface,
              },
            }}
          >
            <Add sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>
      </Box>
    </Stack>
  );
}
