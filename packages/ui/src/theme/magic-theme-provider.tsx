"use client";

import { PropsWithChildren, useMemo } from "react";
import { CssBaseline, GlobalStyles } from "@mui/material";
import { ThemeProvider, alpha, createTheme } from "@mui/material/styles";

export function MagicThemeProvider({ children }: PropsWithChildren) {
  const theme = useMemo(
    () => {
      const backgroundDefault = "#111315";
      const backgroundPaper = "#181a1d";
      const backgroundRaised = "#1d2024";
      const brass = "#c8a16f";
      const brassDark = "#a98153";
      const steel = "#7c8d9f";
      const textPrimary = "#f4eee6";
      const textSecondary = "rgba(228, 220, 209, 0.7)";
      const divider = "rgba(239, 228, 213, 0.12)";

      return createTheme({
        palette: {
          mode: "dark",
          primary: {
            main: brass,
            light: "#dfbf95",
            dark: brassDark,
            contrastText: "#18120c",
          },
          secondary: {
            main: steel,
            light: "#a5b1bf",
            dark: "#627384",
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
            fontWeight: 600,
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
                paddingInline: 16,
                minHeight: 38,
              },
              contained: {
                background: `linear-gradient(180deg, ${alpha(brass, 0.98)} 0%, ${alpha(brassDark, 0.98)} 100%)`,
                boxShadow: "none",
              },
              outlined: {
                borderColor: divider,
                backgroundColor: alpha(backgroundRaised, 0.55),
              },
              text: {
                color: textPrimary,
              },
            },
          },
          MuiIconButton: {
            styleOverrides: {
              root: {
                borderRadius: 14,
                border: `1px solid ${divider}`,
                backgroundColor: alpha(backgroundRaised, 0.68),
              },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: {
                border: "1px solid transparent",
                borderRadius: 999,
                height: 28,
                borderColor: divider,
                backgroundColor: alpha(backgroundRaised, 0.44),
                color: textPrimary,
                "& .MuiChip-icon": {
                  color: "inherit",
                },
                "&.MuiChip-colorPrimary": {
                  color: brass,
                  borderColor: alpha(brass, 0.34),
                  backgroundColor: alpha(brass, 0.14),
                },
              },
              label: {
                paddingInline: 10,
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
                border: `1px solid ${divider}`,
                color: textSecondary,
                backgroundColor: alpha(backgroundRaised, 0.56),
                paddingInline: 14,
                "&.Mui-selected": {
                  color: textPrimary,
                  borderColor: alpha(brass, 0.45),
                  backgroundColor: alpha(brass, 0.14),
                },
              },
            },
          },
          MuiTooltip: {
            styleOverrides: {
              tooltip: {
                borderRadius: 12,
                padding: "8px 10px",
                backgroundColor: alpha("#22262b", 0.96),
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
                backgroundColor: alpha(backgroundRaised, 0.98),
                backgroundImage: "none",
              },
            },
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                borderRadius: 999,
                backgroundColor: alpha(backgroundRaised, 0.62),
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: divider,
                },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: alpha(brass, 0.4),
                },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: alpha(brass, 0.55),
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
          },
          html: {
            background: `
              radial-gradient(circle at top left, rgba(200, 161, 111, 0.08), transparent 34%),
              radial-gradient(circle at top, rgba(124, 141, 159, 0.12), transparent 28%),
              linear-gradient(180deg, #111315 0%, #0d0f11 100%)
            `,
          },
          body: {
            minHeight: "100vh",
            background: "transparent",
            color: "#f4eee6",
          },
          "*": {
            boxSizing: "border-box",
          },
          "::selection": {
            background: "rgba(200, 161, 111, 0.28)",
            color: "#f8f2ea",
          },
          "::-webkit-scrollbar": {
            width: 11,
            height: 11,
          },
          "::-webkit-scrollbar-thumb": {
            background: "rgba(200, 161, 111, 0.24)",
            borderRadius: 999,
          },
        }}
      />
      {children}
    </ThemeProvider>
  );
}
