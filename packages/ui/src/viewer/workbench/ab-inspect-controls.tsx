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

  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{
        flexShrink: 0,
        minHeight: 34,
      }}
    >
      <Box
        sx={{
          width: 104,
          minHeight: 34,
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
              height: 34,
              minHeight: 34,
            },
            "& .MuiSelect-select": {
              display: "flex",
              alignItems: "center",
              minHeight: "34px !important",
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
          minHeight: 34,
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
              width: 34,
              height: 34,
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
              height: 34,
              minHeight: 34,
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
              width: 34,
              height: 34,
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
