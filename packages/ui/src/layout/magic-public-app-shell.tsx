"use client";

import type { ReactNode } from "react";
import { Box } from "@mui/material";
import { MagicMobileNavigationBar } from "./magic-navigation-rail";

interface MagicPublicAppShellProps {
  children: ReactNode;
  footer: ReactNode;
  logoUrl?: string | null;
}

/**
 * Public pages have no destinations to navigate between. Keep the brand bar, but omit the empty
 * navigation rail and drawer so the viewer owns the full available canvas at every desktop width.
 */
export function MagicPublicAppShell({ children, footer, logoUrl }: MagicPublicAppShellProps) {
  return (
    <Box
      sx={{
        "--magic-public-app-bar-height": "56px",
        minHeight: "100vh",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <MagicMobileNavigationBar alwaysVisible logoUrl={logoUrl} />
      <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
        {children}
      </Box>
      {footer}
    </Box>
  );
}
