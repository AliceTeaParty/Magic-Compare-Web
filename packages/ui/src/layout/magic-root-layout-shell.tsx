import type { CSSProperties, ReactNode } from "react";
import { Box } from "@mui/material";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource-variable/noto-serif-jp/wght.css";
import "@fontsource-variable/noto-serif-sc/wght.css";
import { resolveBuildIdentityConfig, resolveFooterConfig } from "@magic-compare/shared-utils";
import { MagicSiteFooter } from "./magic-site-footer";
import { MagicPublicAppShell } from "./magic-public-app-shell";
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
  navigationLogoUrl?: string | null;
  profile?: MagicThemeProfile;
}

/** Shares one adaptive theme while keeping public-only and internal-only shell capabilities apart. */
export function MagicRootLayoutShell({
  children,
  initialThemeSeed,
  lang = "en",
  navigationLogoUrl,
  profile = "public",
}: MagicRootLayoutShellProps) {
  const buildIdentity = resolveBuildIdentityConfig({
    // Next config env values are statically inlined for direct property reads, but not when a
    // helper receives the dynamic process.env object wholesale.
    MAGIC_COMPARE_APP_VERSION: process.env.MAGIC_COMPARE_APP_VERSION,
    MAGIC_COMPARE_COMMIT_SHA: process.env.MAGIC_COMPARE_COMMIT_SHA,
  });
  const footerConfig = resolveFooterConfig({ ...process.env });

  return (
    <html lang={lang} style={rootFontVariables} suppressHydrationWarning>
      <body>
        {/* The App Router cache owns Emotion insertion order across server streaming and hydration,
            preventing duplicate style tags without changing the incumbent CSS priority model. */}
        <AppRouterCacheProvider>
          {/* Public comparison pages use the same M3 color schemes as the internal viewer, so the
              first paint must resolve the scheme before either shell hydrates. */}
          <InitColorSchemeScript
            attribute="data"
            defaultMode="system"
            modeStorageKey="mc-internal-mode"
            colorSchemeStorageKey="mc-internal-color-scheme"
          />
          <MagicThemeProvider initialThemeSeed={initialThemeSeed}>
            {profile === "public" ? (
              <MagicPublicAppShell
                appVersion={buildIdentity.appVersion}
                commitHash={buildIdentity.commitHash}
                footer={<MagicSiteFooter {...footerConfig} />}
                logoUrl={navigationLogoUrl}
              >
                {children}
              </MagicPublicAppShell>
            ) : (
              <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
                <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
                  {children}
                </Box>
              </Box>
            )}
          </MagicThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
