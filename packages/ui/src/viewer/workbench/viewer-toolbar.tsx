"use client";

import { Add, FitScreen, Remove, ViewSidebar } from "@mui/icons-material";
import {
  Box,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import type { ViewerMode } from "@magic-compare/content-schema";
import {
  VIEWER_MAX_PRESET_SCALE,
  VIEWER_MIN_PRESET_SCALE,
} from "@magic-compare/compare-core";

interface ViewerToolbarProps {
  abPresetScale: number;
  abSide: "before" | "after";
  canUseHeatmap: boolean;
  hideFitControl: boolean;
  isStageFitted: boolean;
  mode: ViewerMode;
  onAbSideChange: (side: "before" | "after") => void;
  onModeChange: (mode: ViewerMode) => void;
  onScalePresetChange: (presetScale: number) => void;
  onToggleFit: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

/**
 * Keeps viewer controls in one small surface so mode switching and A/B inspection affordances stay
 * consistent between the internal and public shells.
 */
export function ViewerToolbar({
  abPresetScale,
  abSide,
  canUseHeatmap,
  hideFitControl,
  isStageFitted,
  mode,
  onAbSideChange,
  onModeChange,
  onScalePresetChange,
  onToggleFit,
  onToggleSidebar,
  sidebarOpen,
}: ViewerToolbarProps) {
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
  function handleScalePresetChange(nextPresetScale: number) {
    onScalePresetChange(nextPresetScale);
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
      justifyContent={{ xs: "flex-start", md: "flex-end" }}
      flexWrap="wrap"
      useFlexGap
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ flexShrink: 0 }}
      >
        <Box
          sx={{
            width: 104,
            visibility: mode === "a-b" ? "visible" : "hidden",
          }}
        >
          {mode === "a-b" ? (
            <FormControl
              size="small"
              fullWidth
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
                  handleAbSideChange(
                    String(event.target.value) as "before" | "after",
                  )
                }
                inputProps={{ "aria-label": "Choose A/B side" }}
              >
                <MenuItem value="before">Before</MenuItem>
                <MenuItem value="after">After</MenuItem>
              </Select>
            </FormControl>
          ) : null}
        </Box>
        <Box
          sx={{
            width: 168,
            visibility: mode === "a-b" ? "visible" : "hidden",
          }}
        >
          {mode === "a-b" ? (
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
                disabled={abPresetScale <= VIEWER_MIN_PRESET_SCALE}
                onClick={() => handleScalePresetChange(abPresetScale - 1)}
                sx={{
                  width: 34,
                  height: 34,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 999,
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
                disabled={abPresetScale >= VIEWER_MAX_PRESET_SCALE}
                onClick={() => handleScalePresetChange(abPresetScale + 1)}
                sx={{
                  width: 34,
                  height: 34,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 999,
                }}
              >
                <Add sx={{ fontSize: 16 }} />
              </IconButton>
            </Stack>
          ) : null}
        </Box>
      </Stack>

      <ToggleButtonGroup
        exclusive
        size="small"
        value={mode}
        sx={{
          overflow: "visible",
          alignItems: "stretch",
          "& .MuiToggleButtonGroup-grouped": {
            height: 34,
            minHeight: 34,
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

      {!hideFitControl ? (
        <Tooltip
          title={
            isStageFitted
              ? "Restore compare scale"
              : "Fit the compare stage to the current viewport"
          }
        >
          <IconButton
            size="small"
            onClick={onToggleFit}
            sx={{
              width: 34,
              height: 34,
              borderColor: isStageFitted
                ? "rgba(232, 198, 246, 0.4)"
                : "divider",
              backgroundColor: isStageFitted
                ? "rgba(232, 198, 246, 0.12)"
                : "rgba(255,255,255,0.035)",
            }}
          >
            <FitScreen fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}

      <Tooltip title={sidebarOpen ? "Close details (I)" : "Open details (I)"}>
        <IconButton
          size="small"
          onClick={onToggleSidebar}
          sx={{
            width: 34,
            height: 34,
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
