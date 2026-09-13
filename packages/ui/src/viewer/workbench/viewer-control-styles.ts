export const VIEWER_COMPACT_CONTROL_HEIGHT = { xs: 42, md: 40 } as const;

// Segmented controls previously copied their shell and selected-state rules, which let the mode
// and comparison rows drift apart when either control changed.
export const VIEWER_SEGMENTED_CONTROL_STYLES = {
  overflow: "hidden",
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 999,
  backgroundColor: "surface.containerHigh",
  "& .MuiToggleButtonGroup-grouped": {
    height: "100%",
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
    backgroundColor: "color-mix(in srgb, currentColor 8%, var(--mui-palette-primary-light))",
  },
} as const;
