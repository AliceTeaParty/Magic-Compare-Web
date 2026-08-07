import type { Metadata } from "next";
import { cookies } from "next/headers";
import { resolveSiteBrandConfig } from "@magic-compare/shared-utils";
import {
  buildMagicSiteIcons,
  MAGIC_SITE_VIEWPORT,
  MAGIC_THEME_SEED_COOKIE_NAME,
  MagicRootLayoutShell,
} from "@magic-compare/ui";
import { InternalAppShell } from "@/components/internal-app-shell";
import { loadWorkspaceEnv } from "@/lib/server/env/load-workspace-env";

// Metadata is evaluated before RootLayout runs, so brand environment values must be loaded at
// module initialization for custom favicons to reach Next's generated head tags.
loadWorkspaceEnv();
const brandConfig = resolveSiteBrandConfig(process.env, "internal");

export const metadata: Metadata = {
  applicationName: "Magic Compare",
  // Every internal route previously inherited one generic title, which made several open
  // workspaces indistinguishable in browser tabs. Child pages now supply the identifying prefix.
  title: {
    default: "Magic Compare 内部工作台",
    template: "%s | Magic Compare",
  },
  description: "Magic Compare 内部图像对比、素材上传与发布工作台。",
  // Defaults live outside app/ because Next file-based icons would override configurable metadata.
  icons: buildMagicSiteIcons(brandConfig.faviconUrl),
  // The internal workbench has no useful search or social-preview surface.
  robots: { index: false, follow: false, noarchive: true },
};

export const viewport = MAGIC_SITE_VIEWPORT;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialThemeSeed = cookieStore.get(MAGIC_THEME_SEED_COOKIE_NAME)?.value ?? null;

  return (
    <MagicRootLayoutShell profile="internal" initialThemeSeed={initialThemeSeed} lang="zh-CN">
      <InternalAppShell
        appVersion={process.env.MAGIC_COMPARE_APP_VERSION}
        commitHash={process.env.MAGIC_COMPARE_COMMIT_SHA}
        logoUrl={brandConfig.logoUrl}
      >
        {children}
      </InternalAppShell>
    </MagicRootLayoutShell>
  );
}
