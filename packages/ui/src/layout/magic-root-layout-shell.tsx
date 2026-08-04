import type { ReactNode } from "react";
import { Box } from "@mui/material";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { IBM_Plex_Sans, Noto_Serif_JP, Noto_Serif_SC } from "next/font/google";
import { resolveFooterConfig } from "@magic-compare/shared-utils";
import { MagicSiteFooter } from "./magic-site-footer";
import { MagicThemeProvider } from "../theme/magic-theme-provider";
import type { MagicThemeProfile } from "../theme/magic-theme-provider";

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

interface MagicRootLayoutShellProps {
  children: ReactNode;
  initialThemeSeed?: string | null;
  lang?: string;
  profile?: MagicThemeProfile;
}

/** Separates the public visual profile from the adaptive internal workbench theme. */
export function MagicRootLayoutShell({
  children,
  initialThemeSeed,
  lang = "en",
  profile = "public",
}: MagicRootLayoutShellProps) {
  const footerConfig = resolveFooterConfig({
    ...process.env,
    // Next config env values are statically inlined for direct property reads, but not when a
    // helper receives the dynamic process.env object wholesale.
    MAGIC_COMPARE_APP_VERSION: process.env.MAGIC_COMPARE_APP_VERSION,
    MAGIC_COMPARE_COMMIT_SHA: process.env.MAGIC_COMPARE_COMMIT_SHA,
  });

  return (
    <html lang={lang} className={rootClassName} suppressHydrationWarning>
      <body>
        {profile === "internal" ? (
          <InitColorSchemeScript
            attribute="data"
            defaultMode="system"
            modeStorageKey="mc-internal-mode"
            colorSchemeStorageKey="mc-internal-color-scheme"
          />
        ) : null}
        <MagicThemeProvider profile={profile} initialThemeSeed={initialThemeSeed}>
          <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
              {children}
            </Box>
            {profile === "public" ? <MagicSiteFooter {...footerConfig} /> : null}
          </Box>
        </MagicThemeProvider>
      </body>
    </html>
  );
}
