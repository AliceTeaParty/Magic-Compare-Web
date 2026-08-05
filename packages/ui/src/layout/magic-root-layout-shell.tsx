import type { CSSProperties, ReactNode } from "react";
import { Box } from "@mui/material";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource-variable/noto-serif-jp/wght.css";
import "@fontsource-variable/noto-serif-sc/wght.css";
import { resolveFooterConfig } from "@magic-compare/shared-utils";
import { MagicSiteFooter } from "./magic-site-footer";
import { MagicThemeProvider } from "../theme/magic-theme-provider";
import type { MagicThemeProfile } from "../theme/magic-theme-provider";

// Local Fontsource assets keep container and CI builds independent of Google Fonts availability.
const rootFontVariables = {
  "--font-display-sc": '"Noto Serif SC Variable"',
  "--font-display-jp": '"Noto Serif JP Variable"',
  "--font-body": '"IBM Plex Sans Variable"',
} as CSSProperties;

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
    <html lang={lang} style={rootFontVariables} suppressHydrationWarning>
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
