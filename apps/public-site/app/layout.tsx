import type { Metadata, Viewport } from "next";
import { MagicRootLayoutShell } from "@magic-compare/ui";
import { loadWorkspaceEnv } from "@/lib/env/load-workspace-env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Magic Compare",
  description: "Published compare galleries for encoding case studies.",
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
  loadWorkspaceEnv();
  return <MagicRootLayoutShell>{children}</MagicRootLayoutShell>;
}
