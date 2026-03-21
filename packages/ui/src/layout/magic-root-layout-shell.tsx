import type { ReactNode } from "react";
import { Box } from "@mui/material";
import { IBM_Plex_Sans, Noto_Serif_JP, Noto_Serif_SC } from "next/font/google";
import { resolveFooterConfig } from "@magic-compare/shared-utils";
import { MagicSiteFooter } from "./magic-site-footer";
import { MagicThemeProvider } from "../theme/magic-theme-provider";

const displayFontSc = Noto_Serif_SC({
  preload: false,
  variable: "--font-display-sc",
  weight: ["400", "500", "600", "700"],
});

const displayFontJp = Noto_Serif_JP({
  subsets: ["latin"],
  variable: "--font-display-jp",
  weight: ["400", "500", "600", "700"],
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

const rootClassName = `${displayFontSc.variable} ${displayFontJp.variable} ${bodyFont.variable}`;

export function MagicRootLayoutShell({ children }: { children: ReactNode }) {
  const footerConfig = resolveFooterConfig(process.env);

  return (
    <html lang="en" className={rootClassName}>
      <body>
        <MagicThemeProvider>
          <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
              {children}
            </Box>
            <MagicSiteFooter {...footerConfig} />
          </Box>
        </MagicThemeProvider>
      </body>
    </html>
  );
}
