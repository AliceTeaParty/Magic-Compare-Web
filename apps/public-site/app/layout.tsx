import type { Metadata, Viewport } from "next";
import { MagicRootLayoutShell } from "@magic-compare/ui";
import { loadWorkspaceEnv } from "@/lib/env/load-workspace-env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Magic Compare",
  description: "Published compare galleries for encoding case studies.",
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
