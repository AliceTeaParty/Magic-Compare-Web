import type { Metadata, Viewport } from "next";
import { MagicRootLayoutShell } from "@magic-compare/ui";
import { loadWorkspaceEnv } from "@/lib/server/env/load-workspace-env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Magic Compare Internal",
  description: "Internal image compare workbench for encoding groups.",
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
