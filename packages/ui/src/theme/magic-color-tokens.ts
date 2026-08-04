import {
  argbFromHex,
  Blend,
  Hct,
  hexFromArgb,
  SchemeExpressive,
  TonalPalette,
} from "@material/material-color-utilities";

export const INTERNAL_THEME_PRESETS = [
  { id: "iris", label: "鸢尾", hex: "#6E5AE6" },
  { id: "lagoon", label: "泻湖", hex: "#008C95" },
  { id: "coral", label: "珊瑚", hex: "#D85662" },
] as const;

export type InternalThemePresetId = (typeof INTERNAL_THEME_PRESETS)[number]["id"];

export interface InternalThemeSeed {
  storageValue: string;
  hex: string;
  presetId: InternalThemePresetId | null;
}

export interface InternalSchemeColors {
  mode: "light" | "dark";
  background: string;
  surface: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  primary: ColorRole;
  secondary: ColorRole;
  tertiary: ColorRole;
  error: ColorRole;
  success: ColorRole;
  warning: ColorRole;
}

interface ColorRole {
  main: string;
  onMain: string;
  container: string;
  onContainer: string;
}

const DEFAULT_INTERNAL_THEME_PRESET = INTERNAL_THEME_PRESETS[0];
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const SUCCESS_SEED = "#2E7D32";
const WARNING_SEED = "#A85B00";

export interface MagicColorTokens {
  seeds: {
    lavender: string;
    royal: string;
    deep: string;
    night: string;
    moon: string;
  };
  background: {
    default: string;
    paper: string;
    raised: string;
    elevated: string;
    veil: string;
  };
  primary: {
    main: string;
    light: string;
    dark: string;
    container: string;
    onMain: string;
  };
  secondary: {
    main: string;
    light: string;
    dark: string;
    container: string;
  };
  tertiary: {
    main: string;
    light: string;
    dark: string;
    container: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
  };
  outline: {
    subtle: string;
    default: string;
    strong: string;
  };
  surfaceTint: string;
}

const seeds = {
  lavender: "#E4C2F2",
  royal: "#3747A6",
  deep: "#32498C",
  night: "#152B59",
  moon: "#F2EBC9",
} as const;

function tone(seedHex: string, value: number): string {
  return hexFromArgb(TonalPalette.fromInt(argbFromHex(seedHex)).tone(value));
}

function normalizeHexColor(value: string) {
  const normalized = value.trim().toUpperCase();
  return HEX_COLOR_PATTERN.test(normalized) ? normalized : null;
}

/** Resolves persisted theme input to a known preset or a validated custom seed. */
export function resolveInternalThemeSeed(value?: string | null): InternalThemeSeed {
  const preset = INTERNAL_THEME_PRESETS.find((candidate) => candidate.id === value);
  if (preset) {
    return {
      storageValue: preset.id,
      hex: preset.hex,
      presetId: preset.id,
    };
  }

  if (value?.startsWith("custom:")) {
    const customHex = normalizeHexColor(value.slice("custom:".length));
    if (customHex) {
      return {
        storageValue: `custom:${customHex}`,
        hex: customHex,
        presetId: null,
      };
    }
  }

  return {
    storageValue: DEFAULT_INTERNAL_THEME_PRESET.id,
    hex: DEFAULT_INTERNAL_THEME_PRESET.hex,
    presetId: DEFAULT_INTERNAL_THEME_PRESET.id,
  };
}

/** Converts one tonal palette into the four semantic roles used by MUI status components. */
function buildStatusRole(seedHex: string, sourceHex: string, isDark: boolean): ColorRole {
  const harmonized = Blend.harmonize(argbFromHex(sourceHex), argbFromHex(seedHex));
  const palette = TonalPalette.fromInt(harmonized);

  return {
    main: hexFromArgb(palette.tone(isDark ? 80 : 40)),
    onMain: hexFromArgb(palette.tone(isDark ? 20 : 100)),
    container: hexFromArgb(palette.tone(isDark ? 30 : 90)),
    onContainer: hexFromArgb(palette.tone(isDark ? 90 : 10)),
  };
}

/** Builds the internal workbench palette from the current seed for one color mode. */
export function buildInternalSchemeColors(
  seedValue: string | null | undefined,
  isDark: boolean,
): InternalSchemeColors {
  const seed = resolveInternalThemeSeed(seedValue);
  const scheme = new SchemeExpressive(
    Hct.fromInt(argbFromHex(seed.hex)),
    isDark,
    0,
    "2025",
    "phone",
  );
  const role = (main: number, onMain: number, container: number, onContainer: number) => ({
    main: hexFromArgb(main),
    onMain: hexFromArgb(onMain),
    container: hexFromArgb(container),
    onContainer: hexFromArgb(onContainer),
  });

  return {
    mode: isDark ? "dark" : "light",
    background: hexFromArgb(scheme.background),
    surface: hexFromArgb(scheme.surface),
    surfaceDim: hexFromArgb(scheme.surfaceDim),
    surfaceBright: hexFromArgb(scheme.surfaceBright),
    surfaceContainerLowest: hexFromArgb(scheme.surfaceContainerLowest),
    surfaceContainerLow: hexFromArgb(scheme.surfaceContainerLow),
    surfaceContainer: hexFromArgb(scheme.surfaceContainer),
    surfaceContainerHigh: hexFromArgb(scheme.surfaceContainerHigh),
    surfaceContainerHighest: hexFromArgb(scheme.surfaceContainerHighest),
    onSurface: hexFromArgb(scheme.onSurface),
    onSurfaceVariant: hexFromArgb(scheme.onSurfaceVariant),
    outline: hexFromArgb(scheme.outline),
    outlineVariant: hexFromArgb(scheme.outlineVariant),
    primary: role(
      scheme.primary,
      scheme.onPrimary,
      scheme.primaryContainer,
      scheme.onPrimaryContainer,
    ),
    secondary: role(
      scheme.secondary,
      scheme.onSecondary,
      scheme.secondaryContainer,
      scheme.onSecondaryContainer,
    ),
    tertiary: role(
      scheme.tertiary,
      scheme.onTertiary,
      scheme.tertiaryContainer,
      scheme.onTertiaryContainer,
    ),
    error: role(scheme.error, scheme.onError, scheme.errorContainer, scheme.onErrorContainer),
    success: buildStatusRole(seed.hex, SUCCESS_SEED, isDark),
    warning: buildStatusRole(seed.hex, WARNING_SEED, isDark),
  };
}

export function buildMagicColorTokens(): MagicColorTokens {
  return {
    seeds,
    background: {
      default: tone(seeds.night, 6),
      paper: tone(seeds.night, 8),
      raised: tone(seeds.night, 12),
      elevated: tone(seeds.night, 16),
      veil: tone(seeds.night, 4),
    },
    primary: {
      main: tone(seeds.lavender, 84),
      light: tone(seeds.lavender, 92),
      dark: tone(seeds.lavender, 68),
      container: tone(seeds.lavender, 24),
      onMain: tone(seeds.lavender, 12),
    },
    secondary: {
      main: tone(seeds.royal, 82),
      light: tone(seeds.royal, 92),
      dark: tone(seeds.royal, 64),
      container: tone(seeds.royal, 26),
    },
    tertiary: {
      main: tone(seeds.moon, 90),
      light: tone(seeds.moon, 96),
      dark: tone(seeds.moon, 74),
      container: tone(seeds.moon, 26),
    },
    text: {
      primary: tone(seeds.moon, 97),
      secondary: tone(seeds.night, 90),
      muted: tone(seeds.deep, 84),
    },
    outline: {
      subtle: tone(seeds.deep, 42),
      default: tone(seeds.deep, 58),
      strong: tone(seeds.royal, 74),
    },
    surfaceTint: tone(seeds.royal, 78),
  };
}
