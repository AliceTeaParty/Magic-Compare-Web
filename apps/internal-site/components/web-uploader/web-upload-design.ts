import type { SxProps, Theme } from "@mui/material/styles";

export const webUploadRadii = {
  panel: 1.5,
  control: 1,
  item: 1,
  thumbnail: 0.75,
} as const;

export const webUploadMotion = {
  standard: "200ms cubic-bezier(0.2, 0, 0, 1)",
} as const;

export const webUploadSizes = {
  compactControlHeight: 40,
  dragHandleButton: 40,
  progressHeight: 6,
  statusMarker: 32,
  tinyThumbnailWidth: 26,
  tinyThumbnailHeight: 20,
  inlineIconButton: 32,
} as const;

export const webUploadSurfaces = {
  panel: "var(--mui-palette-surface-containerLow)",
  row: "var(--mui-palette-surface-container)",
  rowHover: "var(--mui-palette-surface-containerHigh)",
  rowSelected:
    "color-mix(in srgb, var(--mui-palette-secondary-main) 14%, var(--mui-palette-surface-container))",
  rowSelectedHover:
    "color-mix(in srgb, var(--mui-palette-secondary-main) 18%, var(--mui-palette-surface-container))",
  stickyHeader: "var(--mui-palette-surface-containerHigh)",
  controlBackground: "var(--mui-palette-surface-containerHigh)",
  progressTrack: "var(--mui-palette-surface-containerHighest)",
  buttonHover: "var(--mui-palette-action-hover)",
  subtleBorder: "var(--mui-palette-divider)",
  thumbnailBorder: "var(--mui-palette-divider)",
} as const;

export const webUploadColors = {
  primaryButtonText: "var(--mui-palette-primary-contrastText)",
  primaryButtonDisabledText: "var(--mui-palette-text-disabled)",
  focusRing: "var(--mui-palette-primary-main)",
} as const;

export const webUploadPanelSx = {
  p: { xs: 1.7, md: 2 },
  borderRadius: webUploadRadii.panel,
  backgroundColor: webUploadSurfaces.panel,
} satisfies SxProps<Theme>;

export const webUploadFieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: webUploadRadii.control,
  },
  "& .MuiOutlinedInput-root.MuiInputBase-multiline": {
    borderRadius: webUploadRadii.control,
  },
} satisfies SxProps<Theme>;
