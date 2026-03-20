import { argbFromHex, hexFromArgb, TonalPalette } from "@material/material-color-utilities";

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

export function buildMagicColorTokens(): MagicColorTokens {
  return {
    seeds,
    background: {
      default: tone(seeds.night, 8),
      paper: tone(seeds.night, 12),
      raised: tone(seeds.night, 16),
      elevated: tone(seeds.night, 20),
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
