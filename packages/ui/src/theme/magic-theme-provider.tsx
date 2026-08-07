"use client";

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CssBaseline, GlobalStyles } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { writeDocumentCookieValue } from "../storage/browser-cookie";
import { buildInternalSchemeColors, resolveInternalThemeSeed } from "./magic-color-tokens";
import { MAGIC_THEME_SEED_COOKIE_NAME, readMagicThemeSeedCookie } from "./magic-theme-storage";

export type MagicThemeProfile = "public" | "internal";

interface InternalThemeContextValue {
  seedValue: string;
  seedHex: string;
  setSeedValue: (value: string) => void;
}

interface MagicThemeProviderProps extends PropsWithChildren {
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
            // Catalog routes scroll while short workspaces may not. Reserving the scrollbar gutter
            // prevents the shared header divider and right-aligned actions from shifting by 17px.
            scrollbarGutter: "stable",
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
      MuiPopover: {
        // Anchored menus and pickers must not alter the page scrollbar or shift the app shell.
        defaultProps: { disableScrollLock: true },
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

/** Owns the shared workbench seed while MUI owns the persisted light/dark selection. */
function MagicWorkbenchThemeProvider({ children, initialThemeSeed }: MagicThemeProviderProps) {
  const [seedValue, setSeedValueState] = useState(
    () => resolveInternalThemeSeed(initialThemeSeed).storageValue,
  );
  const resolvedSeed = useMemo(() => resolveInternalThemeSeed(seedValue), [seedValue]);
  const theme = useMemo(
    () => buildInternalTheme(resolvedSeed.storageValue),
    [resolvedSeed.storageValue],
  );

  useEffect(() => {
    // Static public exports cannot read request cookies in their root layout, which previously
    // reset the accent after every reload. Restore it after hydration from the shared cookie.
    if (initialThemeSeed) return;
    const storedSeed = readMagicThemeSeedCookie(document.cookie);
    if (storedSeed) setSeedValueState(resolveInternalThemeSeed(storedSeed).storageValue);
  }, [initialThemeSeed]);

  const setSeedValue = useCallback((value: string) => {
    const resolved = resolveInternalThemeSeed(value);
    writeDocumentCookieValue(MAGIC_THEME_SEED_COOKIE_NAME, resolved.storageValue);
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

export function MagicThemeProvider({ children, initialThemeSeed }: MagicThemeProviderProps) {
  // Public pages share the current workbench theme; shell capabilities stay outside the theme.
  return (
    <MagicWorkbenchThemeProvider initialThemeSeed={initialThemeSeed}>
      {children}
    </MagicWorkbenchThemeProvider>
  );
}

export const INTERNAL_THEME_STORAGE = {
  mode: INTERNAL_MODE_STORAGE_KEY,
  colorScheme: INTERNAL_SCHEME_STORAGE_KEY,
} as const;
