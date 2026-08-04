"use client";

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { CssBaseline, GlobalStyles } from "@mui/material";
import { ThemeProvider, alpha, createTheme } from "@mui/material/styles";
import {
  buildInternalSchemeColors,
  buildMagicColorTokens,
  resolveInternalThemeSeed,
} from "./magic-color-tokens";

const DISPLAY_HEADING_FAMILY = "var(--font-display-sc), var(--font-display-jp), serif";

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Builds a unified transition shorthand so interactive overrides stay in sync. */
const interactiveTransition = (...props: string[]) =>
  props.map((p) => `${p} 160ms ${EASE_OUT}`).join(", ");

function LegacyMagicThemeProvider({ children }: PropsWithChildren) {
  const tokens = useMemo(() => buildMagicColorTokens(), []);
  const theme = useMemo(() => {
    const backgroundDefault = tokens.background.default;
    const backgroundPaper = tokens.background.paper;
    const backgroundRaised = tokens.background.raised;
    const textPrimary = tokens.text.primary;
    const textSecondary = alpha(tokens.text.secondary, 0.78);
    const divider = alpha(tokens.outline.default, 0.22);
    const subtleDivider = alpha(tokens.outline.subtle, 0.22);
    const hoverTint = alpha(tokens.primary.main, 0.08);
    const selectedTint = alpha(tokens.primary.main, 0.18);
    const pressedTint = alpha(tokens.primary.main, 0.22);

    return createTheme({
      palette: {
        mode: "dark",
        primary: {
          main: tokens.primary.main,
          light: tokens.primary.light,
          dark: tokens.primary.dark,
          contrastText: tokens.primary.onMain,
        },
        secondary: {
          main: tokens.secondary.main,
          light: tokens.secondary.light,
          dark: tokens.secondary.dark,
        },
        background: {
          default: backgroundDefault,
          paper: backgroundPaper,
        },
        divider,
        text: {
          primary: textPrimary,
          secondary: textSecondary,
        },
      },
      shape: {
        borderRadius: 6,
      },
      typography: {
        fontFamily: "var(--font-body)",
        h1: {
          fontFamily: DISPLAY_HEADING_FAMILY,
          fontWeight: 600,
          lineHeight: 0.94,
          letterSpacing: "-0.04em",
          fontSize: "clamp(3rem, 5vw, 5.4rem)",
        },
        h2: {
          fontFamily: DISPLAY_HEADING_FAMILY,
          fontWeight: 600,
          lineHeight: 0.98,
          letterSpacing: "-0.035em",
          fontSize: "clamp(2.4rem, 4vw, 4rem)",
        },
        h3: {
          fontFamily: DISPLAY_HEADING_FAMILY,
          fontWeight: 580,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          fontSize: "clamp(2rem, 3vw, 3rem)",
        },
        h4: {
          fontFamily: DISPLAY_HEADING_FAMILY,
          fontWeight: 560,
          lineHeight: 1.05,
          letterSpacing: "-0.025em",
          fontSize: "clamp(1.7rem, 2.4vw, 2.4rem)",
        },
        h5: {
          fontFamily: DISPLAY_HEADING_FAMILY,
          fontWeight: 560,
          lineHeight: 1.08,
          letterSpacing: "-0.02em",
        },
        h6: {
          fontWeight: 600,
          letterSpacing: "-0.015em",
        },
        subtitle1: {
          fontSize: "0.95rem",
          letterSpacing: "0.015em",
        },
        body1: {
          lineHeight: 1.65,
        },
        body2: {
          lineHeight: 1.55,
        },
        button: {
          textTransform: "none",
          fontWeight: 520,
          letterSpacing: "0.01em",
        },
        overline: {
          fontSize: "0.7rem",
          letterSpacing: "0.18em",
          fontWeight: 600,
        },
      },
      components: {
        MuiPaper: {
          styleOverrides: {
            root: {
              backgroundImage: "none",
              backgroundColor: alpha(backgroundPaper, 0.94),
              boxShadow: "none",
            },
          },
        },
        MuiButtonBase: {
          defaultProps: {
            disableRipple: false,
          },
        },
        MuiButton: {
          styleOverrides: {
            root: {
              // Keep button coordinates stable while hover feedback changes only paint.
              borderRadius: 999,
              paddingInline: 17,
              minHeight: 40,
              transition: interactiveTransition("background-color", "border-color", "box-shadow"),
            },
            contained: {
              background: `linear-gradient(180deg, ${tokens.primary.light} 0%, ${tokens.primary.main} 100%)`,
              color: tokens.primary.onMain,
              boxShadow: `0 14px 36px ${alpha(tokens.primary.dark, 0.28)}`,
              "&:hover": {
                background: `linear-gradient(180deg, ${tokens.primary.light} 0%, ${tokens.primary.main} 100%)`,
                boxShadow: `0 18px 42px ${alpha(tokens.primary.dark, 0.34)}`,
              },
            },
            outlined: {
              borderColor: divider,
              backgroundColor: alpha(backgroundRaised, 0.34),
              "&:hover": {
                borderColor: alpha(tokens.primary.main, 0.42),
                backgroundColor: hoverTint,
              },
            },
            text: {
              color: textPrimary,
              "&:hover": {
                backgroundColor: hoverTint,
              },
            },
          },
        },
        MuiIconButton: {
          styleOverrides: {
            root: {
              borderRadius: 13,
              border: `1px solid ${subtleDivider}`,
              backgroundColor: alpha(tokens.background.elevated, 0.76),
              transition: interactiveTransition("background-color", "border-color"),
              "&:hover": {
                borderColor: alpha(tokens.primary.main, 0.3),
                backgroundColor: alpha(tokens.background.elevated, 0.96),
              },
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              border: "1px solid transparent",
              borderRadius: 999,
              height: 30,
              borderColor: subtleDivider,
              backgroundColor: alpha(tokens.background.elevated, 0.66),
              color: textPrimary,
              "& .MuiChip-icon": {
                color: "inherit",
              },
              "&.MuiChip-colorPrimary": {
                color: tokens.tertiary.light,
                borderColor: alpha(tokens.primary.main, 0.34),
                backgroundColor: alpha(tokens.primary.main, 0.16),
              },
            },
            label: {
              paddingInline: 11,
              fontWeight: 500,
            },
          },
        },
        MuiToggleButtonGroup: {
          styleOverrides: {
            root: {
              gap: 6,
            },
            grouped: {
              margin: 0,
              border: 0,
              borderRadius: 999,
            },
          },
        },
        MuiToggleButton: {
          styleOverrides: {
            root: {
              borderRadius: 999,
              border: `1px solid ${subtleDivider}`,
              color: textSecondary,
              backgroundColor: alpha(tokens.background.elevated, 0.62),
              paddingInline: 14,
              transition: interactiveTransition(
                "background-color",
                "border-color",
                "color",
              ),
              "&:hover": {
                borderColor: alpha(tokens.secondary.main, 0.36),
                backgroundColor: alpha(tokens.background.elevated, 0.82),
              },
              "&.Mui-selected": {
                color: textPrimary,
                borderColor: alpha(tokens.primary.main, 0.48),
                backgroundColor: selectedTint,
              },
              "&.Mui-selected:hover": {
                backgroundColor: pressedTint,
              },
            },
          },
        },
        MuiTooltip: {
          styleOverrides: {
            tooltip: {
              borderRadius: 12,
              padding: "8px 10px",
              backgroundColor: alpha(tokens.background.veil, 0.98),
              border: `1px solid ${divider}`,
              color: textPrimary,
            },
          },
        },
        MuiMenu: {
          styleOverrides: {
            paper: {
              borderRadius: 18,
              border: `1px solid ${divider}`,
              backgroundColor: alpha(tokens.background.elevated, 0.98),
              backgroundImage: "none",
            },
          },
        },
        MuiOutlinedInput: {
          styleOverrides: {
            root: {
              borderRadius: 999,
              backgroundColor: alpha(tokens.background.elevated, 0.68),
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: subtleDivider,
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: alpha(tokens.secondary.main, 0.4),
              },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: alpha(tokens.primary.main, 0.55),
              },
            },
            input: {
              paddingBlock: 10,
            },
          },
        },
        MuiSelect: {
          styleOverrides: {
            select: {
              display: "flex",
              alignItems: "center",
              minHeight: "unset",
            },
          },
        },
      },
    });
  }, [tokens]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          ":root": {
            colorScheme: "dark",
            "--mc-bg-default": tokens.background.default,
            "--mc-bg-paper": tokens.background.paper,
            "--mc-bg-raised": tokens.background.raised,
            "--mc-bg-elevated": tokens.background.elevated,
            "--mc-outline": tokens.outline.default,
            "--mc-outline-subtle": tokens.outline.subtle,
            "--mc-primary": tokens.primary.main,
            "--mc-primary-light": tokens.primary.light,
            "--mc-secondary": tokens.secondary.main,
            "--mc-tertiary": tokens.tertiary.main,
            "--mc-text-primary": tokens.text.primary,
            "--mc-text-secondary": tokens.text.secondary,
          },
          html: {
            background: `
              radial-gradient(circle at 12% 0%, ${alpha(tokens.primary.main, 0.04)} 0%, transparent 28%),
              radial-gradient(circle at 88% 12%, ${alpha(tokens.secondary.main, 0.06)} 0%, transparent 26%),
              radial-gradient(circle at 52% 100%, ${alpha(tokens.tertiary.main, 0.03)} 0%, transparent 32%),
              linear-gradient(180deg, ${tokens.background.default} 0%, ${tokens.background.veil} 100%)
            `,
          },
          body: {
            minHeight: "100vh",
            background: "transparent",
            color: tokens.text.primary,
          },
          "*": {
            boxSizing: "border-box",
          },
          "::selection": {
            background: alpha(tokens.primary.main, 0.3),
            color: tokens.primary.onMain,
          },
          "::-webkit-scrollbar": {
            width: 12,
            height: 12,
          },
          "::-webkit-scrollbar-thumb": {
            background: alpha(tokens.secondary.main, 0.26),
            borderRadius: 999,
            border: `3px solid ${alpha(tokens.background.veil, 0)}`,
          },
          "::-webkit-scrollbar-track": {
            background: alpha(tokens.background.veil, 0.14),
          },
        }}
      />
      {children}
    </ThemeProvider>
  );
}

export type MagicThemeProfile = "public" | "internal";

interface InternalThemeContextValue {
  seedValue: string;
  seedHex: string;
  setSeedValue: (value: string) => void;
}

interface MagicThemeProviderProps extends PropsWithChildren {
  profile?: MagicThemeProfile;
  initialThemeSeed?: string | null;
}

const INTERNAL_MODE_STORAGE_KEY = "mc-internal-mode";
const INTERNAL_SCHEME_STORAGE_KEY = "mc-internal-color-scheme";
const InternalThemeContext = createContext<InternalThemeContextValue | null>(null);

function rolePalette(role: ReturnType<typeof buildInternalSchemeColors>["primary"]) {
  return {
    main: role.main,
    contrastText: role.onMain,
    light: role.container,
    dark: role.main,
    onContainer: role.onContainer,
  };
}

/** Maps Material 3 color roles into a MUI palette without discarding surface hierarchy. */
function buildInternalPalette(seedValue: string | null | undefined, isDark: boolean) {
  const scheme = buildInternalSchemeColors(seedValue, isDark);

  return {
    mode: scheme.mode,
    primary: rolePalette(scheme.primary),
    secondary: rolePalette(scheme.secondary),
    info: rolePalette(scheme.tertiary),
    success: rolePalette(scheme.success),
    warning: rolePalette(scheme.warning),
    error: rolePalette(scheme.error),
    background: {
      default: scheme.background,
      paper: scheme.surfaceContainerLow,
    },
    text: {
      primary: scheme.onSurface,
      secondary: scheme.onSurfaceVariant,
    },
    divider: scheme.outlineVariant,
    surface: {
      dim: scheme.surfaceDim,
      bright: scheme.surfaceBright,
      containerLowest: scheme.surfaceContainerLowest,
      containerLow: scheme.surfaceContainerLow,
      container: scheme.surfaceContainer,
      containerHigh: scheme.surfaceContainerHigh,
      containerHighest: scheme.surfaceContainerHighest,
    },
  };
}

/** Creates the internal workbench theme from Material 3 roles and component specifications. */
function buildInternalTheme(seedValue: string) {
  return createTheme({
    cssVariables: {
      colorSchemeSelector: "data",
      nativeColor: true,
    },
    colorSchemes: {
      light: { palette: buildInternalPalette(seedValue, false) },
      dark: { palette: buildInternalPalette(seedValue, true) },
    },
    breakpoints: {
      values: { xs: 0, sm: 600, md: 840, lg: 1200, xl: 1600 },
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: "var(--font-body)",
      fontWeightRegular: 450,
      h1: { fontSize: "2rem", lineHeight: 1.2, fontWeight: 650, letterSpacing: 0 },
      h2: { fontSize: "1.625rem", lineHeight: 1.25, fontWeight: 650, letterSpacing: 0 },
      h3: { fontSize: "1.375rem", lineHeight: 1.3, fontWeight: 650, letterSpacing: 0 },
      h4: { fontSize: "1.125rem", lineHeight: 1.35, fontWeight: 650, letterSpacing: 0 },
      h5: { fontSize: "1rem", lineHeight: 1.4, fontWeight: 650, letterSpacing: 0 },
      h6: { fontSize: "0.875rem", lineHeight: 1.45, fontWeight: 650, letterSpacing: 0 },
      subtitle1: { fontSize: "0.875rem", lineHeight: 1.45, fontWeight: 600, letterSpacing: 0 },
      subtitle2: { fontSize: "0.8125rem", lineHeight: 1.4, fontWeight: 600, letterSpacing: 0 },
      body1: { fontSize: "0.9375rem", lineHeight: 1.55, fontWeight: 450, letterSpacing: 0 },
      body2: { fontSize: "0.8125rem", lineHeight: 1.5, fontWeight: 450, letterSpacing: 0 },
      button: { fontSize: "0.875rem", fontWeight: 650, textTransform: "none", letterSpacing: 0 },
      caption: { fontSize: "0.75rem", lineHeight: 1.4, fontWeight: 450, letterSpacing: 0 },
      overline: { fontSize: "0.6875rem", lineHeight: 1.4, fontWeight: 650, letterSpacing: 0 },
    },
    motion: { reducedMotion: "system" },
    transitions: {
      easing: {
        easeInOut: "cubic-bezier(0.2, 0, 0, 1)",
        easeOut: "cubic-bezier(0, 0, 0, 1)",
        easeIn: "cubic-bezier(0.3, 0, 1, 1)",
        sharp: "cubic-bezier(0.2, 0, 0, 1)",
      },
      duration: { shortest: 100, shorter: 150, short: 200, standard: 250 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "*, *::before, *::after": { boxSizing: "border-box" },
          html: {
            backgroundColor: "var(--mui-palette-background-default)",
            transition: "background-color 250ms cubic-bezier(0.2, 0, 0, 1)",
          },
          body: {
            minWidth: 0,
            minHeight: "100vh",
            fontWeight: 450,
            backgroundColor: "var(--mui-palette-background-default)",
            transition:
              "background-color 250ms cubic-bezier(0.2, 0, 0, 1), color 250ms cubic-bezier(0.2, 0, 0, 1)",
          },
          ".MuiPaper-root, .MuiDrawer-paper, .MuiAppBar-root, .MuiInputBase-root": {
            // Theme switching previously disabled every transition, making the whole workbench
            // flash. Limiting interpolation to painted colors keeps geometry and controls stable.
            transition:
              "background-color 250ms cubic-bezier(0.2, 0, 0, 1), color 250ms cubic-bezier(0.2, 0, 0, 1), border-color 250ms cubic-bezier(0.2, 0, 0, 1)",
          },
          "@media (prefers-reduced-motion: reduce)": {
            "html, body, .MuiPaper-root, .MuiDrawer-paper, .MuiAppBar-root, .MuiInputBase-root": {
              transitionDuration: "0.01ms !important",
            },
          },
          "::selection": {
            color: "var(--mui-palette-primary-contrastText)",
            backgroundColor: "var(--mui-palette-primary-main)",
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: "var(--mui-palette-surface-containerLow)",
            boxShadow: "none",
          },
        },
      },
      MuiButtonBase: {
        defaultProps: { disableRipple: false },
        styleOverrides: {
          root: {
            letterSpacing: 0,
            transition:
              "background-color 150ms cubic-bezier(0.2, 0, 0, 1), color 150ms cubic-bezier(0.2, 0, 0, 1), border-color 150ms cubic-bezier(0.2, 0, 0, 1)",
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            minHeight: 40,
            borderRadius: 20,
            paddingInline: 20,
            whiteSpace: "nowrap",
            boxShadow: "none",
            "&:hover": { boxShadow: "none" },
          },
          contained: {
            "&:hover": {
              backgroundColor:
                "color-mix(in srgb, currentColor 8%, var(--mui-palette-primary-main))",
            },
          },
          outlined: {
            borderColor: "var(--mui-palette-outlineVariant, var(--mui-palette-divider))",
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            width: 40,
            height: 40,
            borderRadius: 20,
            "&:hover": { backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)" },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { height: 32, borderRadius: 8, fontWeight: 600 },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { borderRadius: 20 },
          grouped: { minHeight: 40, margin: 0, whiteSpace: "nowrap" },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            minHeight: 40,
            paddingInline: 16,
            borderColor: "var(--mui-palette-divider)",
            color: "var(--mui-palette-text-secondary)",
            "&.Mui-selected": {
              color: "var(--mui-palette-secondary-contrastText)",
              backgroundColor: "var(--mui-palette-secondary-main)",
            },
            "&.Mui-selected:hover": {
              backgroundColor:
                "color-mix(in srgb, currentColor 8%, var(--mui-palette-secondary-main))",
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            // The darkest M3 surface is pure black in dark mode; using the higher container role
            // keeps editable fields visibly related to their surrounding work surface.
            borderRadius: 8,
            backgroundColor: "var(--mui-palette-surface-containerHighest)",
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 16, backgroundColor: "var(--mui-palette-surface-containerHigh)" },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { borderRadius: 8, backgroundColor: "var(--mui-palette-surface-containerHigh)" },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 4,
            color: "var(--mui-palette-surface-containerLowest)",
            backgroundColor: "var(--mui-palette-text-primary)",
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            // MUI 9 exposes variant and color as separate classes after removing combined Alert
            // slots, so tonal status surfaces are composed at the root.
            "&.MuiAlert-standard.MuiAlert-colorSuccess": {
              color: "var(--mui-palette-text-primary)",
              backgroundColor: "var(--mui-palette-success-light)",
              "& .MuiAlert-icon": { color: "var(--mui-palette-success-main)" },
            },
            "&.MuiAlert-standard.MuiAlert-colorInfo": {
              color: "var(--mui-palette-text-primary)",
              backgroundColor: "var(--mui-palette-info-light)",
              "& .MuiAlert-icon": { color: "var(--mui-palette-info-main)" },
            },
            "&.MuiAlert-standard.MuiAlert-colorWarning": {
              color: "var(--mui-palette-text-primary)",
              backgroundColor: "var(--mui-palette-warning-light)",
              "& .MuiAlert-icon": { color: "var(--mui-palette-warning-main)" },
            },
            "&.MuiAlert-standard.MuiAlert-colorError": {
              color: "var(--mui-palette-text-primary)",
              backgroundColor: "var(--mui-palette-error-light)",
              "& .MuiAlert-icon": { color: "var(--mui-palette-error-main)" },
            },
          },
        },
      },
    },
  });
}

/** Owns the persisted internal seed while MUI owns the persisted light/dark selection. */
function InternalMagicThemeProvider({ children, initialThemeSeed }: MagicThemeProviderProps) {
  const [seedValue, setSeedValueState] = useState(
    () => resolveInternalThemeSeed(initialThemeSeed).storageValue,
  );
  const resolvedSeed = useMemo(() => resolveInternalThemeSeed(seedValue), [seedValue]);
  const theme = useMemo(
    () => buildInternalTheme(resolvedSeed.storageValue),
    [resolvedSeed.storageValue],
  );
  const setSeedValue = useCallback((value: string) => {
    const resolved = resolveInternalThemeSeed(value);
    document.cookie = `mc_internal_theme=${encodeURIComponent(resolved.storageValue)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setSeedValueState(resolved.storageValue);
  }, []);
  const contextValue = useMemo(
    () => ({ seedValue: resolvedSeed.storageValue, seedHex: resolvedSeed.hex, setSeedValue }),
    [resolvedSeed, setSeedValue],
  );

  return (
    <InternalThemeContext.Provider value={contextValue}>
      <ThemeProvider
        theme={theme}
        defaultMode="system"
        modeStorageKey={INTERNAL_MODE_STORAGE_KEY}
        colorSchemeStorageKey={INTERNAL_SCHEME_STORAGE_KEY}
      >
        <CssBaseline enableColorScheme />
        <GlobalStyles
          styles={{
            ":root": {
              "--mc-bg-default": "var(--mui-palette-background-default)",
              "--mc-bg-paper": "var(--mui-palette-surface-containerLow)",
              "--mc-bg-raised": "var(--mui-palette-surface-container)",
              "--mc-bg-elevated": "var(--mui-palette-surface-containerHigh)",
              "--mc-outline": "var(--mui-palette-divider)",
              "--mc-outline-subtle": "var(--mui-palette-divider)",
              "--mc-primary": "var(--mui-palette-primary-main)",
              "--mc-primary-light": "var(--mui-palette-primary-light)",
              "--mc-secondary": "var(--mui-palette-secondary-main)",
              "--mc-tertiary": "var(--mui-palette-info-main)",
              "--mc-text-primary": "var(--mui-palette-text-primary)",
              "--mc-text-secondary": "var(--mui-palette-text-secondary)",
              "--mc-viewer-shadow": "none",
            },
          }}
        />
        {children}
      </ThemeProvider>
    </InternalThemeContext.Provider>
  );
}

export function useInternalTheme() {
  const context = useContext(InternalThemeContext);
  if (!context) throw new Error("useInternalTheme must be used inside the internal theme profile");
  return context;
}

export function MagicThemeProvider({
  children,
  profile = "public",
  initialThemeSeed,
}: MagicThemeProviderProps) {
  if (profile === "internal") {
    return (
      <InternalMagicThemeProvider initialThemeSeed={initialThemeSeed} profile="internal">
        {children}
      </InternalMagicThemeProvider>
    );
  }

  return <LegacyMagicThemeProvider>{children}</LegacyMagicThemeProvider>;
}

export const INTERNAL_THEME_STORAGE = {
  mode: INTERNAL_MODE_STORAGE_KEY,
  colorScheme: INTERNAL_SCHEME_STORAGE_KEY,
} as const;
