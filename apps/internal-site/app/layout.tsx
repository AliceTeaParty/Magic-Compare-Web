import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { MagicRootLayoutShell } from "@magic-compare/ui";
import { InternalAppShell } from "@/components/internal-app-shell";
import { loadWorkspaceEnv } from "@/lib/server/env/load-workspace-env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Magic Compare Internal",
  description: "Internal image compare workbench for encoding groups.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "64x64" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  loadWorkspaceEnv();
  const cookieStore = await cookies();
  const initialThemeSeed = cookieStore.get("mc_internal_theme")?.value ?? null;

  return (
    <MagicRootLayoutShell profile="internal" initialThemeSeed={initialThemeSeed} lang="zh-CN">
      <InternalAppShell
        appVersion={process.env.MAGIC_COMPARE_APP_VERSION}
        commitHash={process.env.MAGIC_COMPARE_COMMIT_SHA}
      >
        {children}
      </InternalAppShell>
    </MagicRootLayoutShell>
  );
}
