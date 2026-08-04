import "@mui/material/styles";

interface MagicSurfacePalette {
  dim: string;
  bright: string;
  containerLowest: string;
  containerLow: string;
  container: string;
  containerHigh: string;
  containerHighest: string;
}

declare module "@mui/material/styles" {
  interface Palette {
    surface: MagicSurfacePalette;
  }

  interface PaletteOptions {
    surface?: MagicSurfacePalette;
  }
}
