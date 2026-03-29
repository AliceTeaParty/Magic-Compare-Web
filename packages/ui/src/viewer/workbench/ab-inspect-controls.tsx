"use client";

import { Add, Remove } from "@mui/icons-material";
import { Box, FormControl, IconButton, MenuItem, Select, Stack } from "@mui/material";
import {
  VIEWER_MAX_PRESET_SCALE,
  VIEWER_MIN_PRESET_SCALE,
} from "@magic-compare/compare-core";

interface AbInspectControlsProps {
  abPresetScale: number;
  abSide: "before" | "after";
  onAbSideChange: (side: "before" | "after") => void;
  onScalePresetChange: (presetScale: number) => void;
  showControls: boolean;
}

/**
 * Keeps the A/B-only controls together so the toolbar can reserve their layout space without
 * mixing mode-specific rendering details into the shared viewer action row.
 */
export function AbInspectControls({
  abPresetScale,
  abSide,
  onAbSideChange,
  onScalePresetChange,
  showControls,
}: AbInspectControlsProps) {
  const isAtMinScale = abPresetScale <= VIEWER_MIN_PRESET_SCALE;
  const isAtMaxScale = abPresetScale >= VIEWER_MAX_PRESET_SCALE;
  // Match the viewer toolbar target size so mode switching and zoom adjustment feel like one
  // control family instead of mixing desktop-tight and touch-friendly hit areas.
  const compactControlHeight = { xs: 42, md: 40 };
  const compactIconButtonSize = { xs: 42, md: 40 };

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
          visibility: showControls ? "visible" : "hidden",
          pointerEvents: showControls ? "auto" : "none",
        }}
      >
        <FormControl
          size="small"
          fullWidth
          disabled={!showControls}
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
            onChange={(event) =>
              onAbSideChange(String(event.target.value) as "before" | "after")
            }
            inputProps={{ "aria-label": "Choose A/B side" }}
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
          visibility: showControls ? "visible" : "hidden",
          pointerEvents: showControls ? "auto" : "none",
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
            aria-label="Decrease A/B scale"
            disabled={!showControls || isAtMinScale}
            onClick={() => onScalePresetChange(abPresetScale - 1)}
            sx={{
              width: compactIconButtonSize,
              height: compactIconButtonSize,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 999,
              "&.Mui-disabled": {
                color: "text.disabled",
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.02)",
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
            {abPresetScale}x Scale
          </Box>
          <IconButton
            size="small"
            aria-label="Increase A/B scale"
            disabled={!showControls || isAtMaxScale}
            onClick={() => onScalePresetChange(abPresetScale + 1)}
            sx={{
              width: compactIconButtonSize,
              height: compactIconButtonSize,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 999,
              "&.Mui-disabled": {
                color: "text.disabled",
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.02)",
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
