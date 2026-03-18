"use client";

import { PropsWithChildren, useMemo } from "react";
import { CssBaseline, GlobalStyles, ThemeProvider, createTheme } from "@mui/material";

export function MagicThemeProvider({ children }: PropsWithChildren) {
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: "dark",
          primary: {
            main: "#8cc1ff",
          },
          secondary: {
            main: "#f1a863",
          },
          background: {
            default: "#0f1319",
            paper: "#171c23",
          },
          divider: "rgba(140, 193, 255, 0.12)",
          text: {
            primary: "#ecf1f8",
            secondary: "rgba(236, 241, 248, 0.72)",
          },
        },
        shape: {
          borderRadius: 18,
        },
        typography: {
          fontFamily: "var(--font-body)",
          h1: {
            fontFamily: "var(--font-display)",
            fontWeight: 700,
          },
          h2: {
            fontFamily: "var(--font-display)",
            fontWeight: 700,
          },
          h3: {
            fontFamily: "var(--font-display)",
            fontWeight: 650,
          },
          button: {
            textTransform: "none",
            fontWeight: 600,
          },
        },
        components: {
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage:
                  "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))",
              },
            },
          },
          MuiButtonBase: {
            defaultProps: {
              disableRipple: false,
            },
          },
        },
      }),
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
            background:
              "radial-gradient(circle at top, rgba(85, 121, 166, 0.12), transparent 40%), #0f1319",
          },
          body: {
            minHeight: "100vh",
            background: "transparent",
          },
          "*": {
            boxSizing: "border-box",
          },
          "::-webkit-scrollbar": {
            width: 10,
            height: 10,
          },
          "::-webkit-scrollbar-thumb": {
            background: "rgba(140, 193, 255, 0.24)",
            borderRadius: 999,
          },
        }}
      />
      {children}
    </ThemeProvider>
  );
}
