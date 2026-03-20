"use client";

import { PropsWithChildren, useMemo } from "react";
import { CssBaseline, GlobalStyles } from "@mui/material";
import { ThemeProvider, alpha, createTheme } from "@mui/material/styles";
import { buildMagicColorTokens } from "./magic-color-tokens";

export function MagicThemeProvider({ children }: PropsWithChildren) {
  const theme = useMemo(
    () => {
      const tokens = buildMagicColorTokens();
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
            fontFamily: "var(--font-display-sc), var(--font-display-jp), serif",
            fontWeight: 600,
            lineHeight: 0.94,
            letterSpacing: "-0.04em",
            fontSize: "clamp(3rem, 5vw, 5.4rem)",
          },
          h2: {
            fontFamily: "var(--font-display-sc), var(--font-display-jp), serif",
            fontWeight: 600,
            lineHeight: 0.98,
            letterSpacing: "-0.035em",
            fontSize: "clamp(2.4rem, 4vw, 4rem)",
          },
          h3: {
            fontFamily: "var(--font-display-sc), var(--font-display-jp), serif",
            fontWeight: 580,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            fontSize: "clamp(2rem, 3vw, 3rem)",
          },
          h4: {
            fontFamily: "var(--font-display-sc), var(--font-display-jp), serif",
            fontWeight: 560,
            lineHeight: 1.05,
            letterSpacing: "-0.025em",
            fontSize: "clamp(1.7rem, 2.4vw, 2.4rem)",
          },
          h5: {
            fontFamily: "var(--font-display-sc), var(--font-display-jp), serif",
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
                borderRadius: 999,
                paddingInline: 17,
                minHeight: 40,
                transition:
                  "transform 160ms cubic-bezier(0.22, 1, 0.36, 1), background-color 160ms cubic-bezier(0.22, 1, 0.36, 1), border-color 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 160ms cubic-bezier(0.22, 1, 0.36, 1)",
                "&:hover": {
                  transform: "translateY(-1px)",
                },
                "&:active": {
                  transform: "translateY(0)",
                },
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
                transition:
                  "transform 160ms cubic-bezier(0.22, 1, 0.36, 1), background-color 160ms cubic-bezier(0.22, 1, 0.36, 1), border-color 160ms cubic-bezier(0.22, 1, 0.36, 1)",
                "&:hover": {
                  transform: "translateY(-1px)",
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
                transition:
                  "transform 160ms cubic-bezier(0.22, 1, 0.36, 1), background-color 160ms cubic-bezier(0.22, 1, 0.36, 1), border-color 160ms cubic-bezier(0.22, 1, 0.36, 1), color 160ms cubic-bezier(0.22, 1, 0.36, 1)",
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
    },
    [],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          ":root": {
            colorScheme: "dark",
            "--mc-bg-default": backgroundDefault,
            "--mc-bg-paper": backgroundPaper,
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
              radial-gradient(circle at 12% 0%, ${alpha(tokens.primary.main, 0.1)} 0%, transparent 30%),
              radial-gradient(circle at 88% 12%, ${alpha(tokens.secondary.main, 0.12)} 0%, transparent 28%),
              radial-gradient(circle at 52% 100%, ${alpha(tokens.tertiary.main, 0.08)} 0%, transparent 34%),
              linear-gradient(180deg, ${backgroundDefault} 0%, ${tokens.background.veil} 100%)
            `,
          },
          body: {
            minHeight: "100vh",
            background: "transparent",
            color: textPrimary,
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
            background: alpha(tokens.background.veil, 0.2),
          },
        }}
      />
      {children}
    </ThemeProvider>
  );
}
