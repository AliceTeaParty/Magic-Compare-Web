import type { SxProps, Theme } from "@mui/material/styles";

export const webUploadRadii = {
  panel: 3,
  control: 1.5,
  item: 1.25,
  thumbnail: 1,
} as const;

export const webUploadMotion = {
  standard: "160ms cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

export const webUploadSizes = {
  compactControlHeight: 32,
  dragHandleButton: 32,
  progressHeight: 6,
  statusMarker: 26,
  tinyThumbnailWidth: 26,
  tinyThumbnailHeight: 20,
  inlineIconButton: 22,
} as const;

export const webUploadSurfaces = {
  panel:
    "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)",
  row: "rgba(255,255,255,0.035)",
  rowHover: "rgba(255,255,255,0.035)",
  rowSelected: "rgba(232,198,246,0.075)",
  rowSelectedHover: "rgba(232,198,246,0.09)",
  stickyHeader: "rgba(10, 24, 51, 0.97)",
  controlBackground: "rgba(255,255,255,0.055)",
  progressTrack: "rgba(255,255,255,0.08)",
  buttonHover: "rgba(255,255,255,0.04)",
  subtleBorder: "rgba(255,255,255,0.075)",
  thumbnailBorder: "rgba(255,255,255,0.12)",
} as const;

export const webUploadColors = {
  primaryButtonText: "rgba(24, 15, 31, 0.92)",
  primaryButtonDisabledText: "rgba(24, 15, 31, 0.46)",
  focusRing: "rgba(232,198,246,0.58)",
} as const;

export const webUploadPanelSx = {
  p: { xs: 1.7, md: 2 },
  borderRadius: webUploadRadii.panel,
  border: "1px solid",
  borderColor: "divider",
  background: webUploadSurfaces.panel,
} satisfies SxProps<Theme>;

export const webUploadFieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: webUploadRadii.control,
  },
  "& .MuiOutlinedInput-root.MuiInputBase-multiline": {
    borderRadius: webUploadRadii.control,
  },
} satisfies SxProps<Theme>;
