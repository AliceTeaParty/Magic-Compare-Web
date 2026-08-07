import type { Metadata, Viewport } from "next";
import { resolveSiteBrandConfig } from "@magic-compare/shared-utils";
import { MagicRootLayoutShell } from "@magic-compare/ui";
import { loadWorkspaceEnv } from "@/lib/env/load-workspace-env";
import "./globals.css";

// Static metadata is generated before RootLayout renders, so load the workspace environment here
// or a configured public favicon would silently fall back to the checked-in asset during export.
loadWorkspaceEnv();
const brandConfig = resolveSiteBrandConfig(process.env, "public");

export const metadata: Metadata = {
  title: "Magic Compare",
  description: "Published compare galleries for encoding case studies.",
  icons: {
    // Defaults live outside app/ because Next file-based icons would override this configurable
    // metadata object during static export before the public environment value can take effect.
    icon: brandConfig.faviconUrl
      ? [{ url: brandConfig.faviconUrl, sizes: "any" }]
      : [
          { url: "/default-favicon.ico", sizes: "any" },
          { url: "/default-icon.png", type: "image/png", sizes: "64x64" },
        ],
    apple: [{ url: "/default-apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Public compare pages are meant for direct sharing, not passive discovery by search crawlers.
  // Real traffic filtering happens at Cloudflare and the image host, but these directives keep the
  // static site from volunteering itself for indexing.
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      noarchive: true,
      nosnippet: true,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <MagicRootLayoutShell lang="zh-CN" navigationLogoUrl={brandConfig.logoUrl}>
      {children}
    </MagicRootLayoutShell>
  );
}
