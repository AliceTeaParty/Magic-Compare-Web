import { argbFromHex, Hct, hexFromArgb, SchemeContent } from "@material/material-color-utilities";

export interface StageImagePlaceholderColors {
  accent: string;
  background: string;
  foreground: string;
  outline: string;
  panel: string;
}

/** Builds a local Material content scheme so each placeholder stays legible in both color modes. */
export function buildStageImagePlaceholderColors(
  sourceColor: string,
  isDark: boolean,
): StageImagePlaceholderColors {
  const scheme = new SchemeContent(
    Hct.fromInt(argbFromHex(sourceColor)),
    isDark,
    0,
    "2025",
    "phone",
  );

  return {
    accent: hexFromArgb(scheme.primary),
    background: hexFromArgb(scheme.surfaceContainer),
    foreground: hexFromArgb(scheme.onSurface),
    outline: hexFromArgb(scheme.outlineVariant),
    panel: hexFromArgb(scheme.surfaceContainerHigh),
  };
}
