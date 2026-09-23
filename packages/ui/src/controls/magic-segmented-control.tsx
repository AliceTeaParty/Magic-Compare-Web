"use client";

import { ToggleButtonGroup, type ToggleButtonGroupProps } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

const segmentedControlSx: SxProps<Theme> = {
  alignItems: "stretch",
  overflow: "hidden",
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 999,
  backgroundColor: "surface.containerHigh",
  "& .MuiToggleButtonGroup-grouped": {
    minHeight: 40,
    margin: "0 !important",
    border: "0 !important",
    borderRadius: "0 !important",
    justifyContent: "center",
    textAlign: "center",
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
      "color-mix(in srgb, var(--mui-palette-primary-onContainer) 8%, var(--mui-palette-primary-light))",
  },
};

/**
 * Keeps mutually exclusive choices connected without making a selected option look like a separate
 * button. Consumers pass normal MUI ToggleButton children and retain the ToggleButtonGroup API.
 */
export function MagicSegmentedControl({ sx, ...props }: ToggleButtonGroupProps) {
  const mergedSx = [
    segmentedControlSx,
    ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
  ] as SxProps<Theme>;

  return <ToggleButtonGroup {...props} sx={mergedSx} />;
}
