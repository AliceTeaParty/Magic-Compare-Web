"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Box, Divider, Drawer, Stack, useMediaQuery } from "@mui/material";
import { useRootScrollLock } from "../overlays/use-root-scroll-lock";
import { MagicThemeControls } from "../theme/magic-theme-controls";
import {
  MAGIC_NAV_RAIL_MEDIA_QUERY,
  MAGIC_NAV_RAIL_MIN_WIDTH,
  MAGIC_NAV_RAIL_WIDTH,
  MagicBuildVersionLabel,
  MagicMobileNavigationBar,
  MagicNavigationLogo,
} from "./magic-navigation-rail";

interface MagicPublicAppShellProps {
  appVersion?: string | null;
  children: ReactNode;
  commitHash?: string | null;
  footer: ReactNode;
  logoUrl?: string | null;
}

/** Keeps the read-only public rail limited to brand and display personalization controls. */
function PublicNavigationContent({
  appVersion,
  commitHash,
  compact,
  logoUrl,
}: {
  appVersion?: string | null;
  commitHash?: string | null;
  compact: boolean;
  logoUrl?: string | null;
}) {
  return (
    <Stack sx={{ height: "100%", minHeight: 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: compact ? "center" : "flex-start",
          height: 72,
          px: compact ? 0 : 2,
        }}
      >
        <MagicNavigationLogo logoUrl={logoUrl} />
      </Box>

      <Stack spacing={1} sx={{ mt: "auto", p: compact ? 1 : 1.5 }}>
        <Divider />
        <MagicThemeControls compact={compact} />
        <MagicBuildVersionLabel appVersion={appVersion} commitHash={commitHash} compact={compact} />
      </Stack>
    </Stack>
  );
}

/** Adds public display controls without exposing internal destinations or write actions. */
export function MagicPublicAppShell({
  appVersion,
  children,
  commitHash,
  footer,
  logoUrl,
}: MagicPublicAppShellProps) {
  const railVisible = useMediaQuery(`(min-width:${MAGIC_NAV_RAIL_MIN_WIDTH}px)`);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileDrawerOpen = mobileOpen && !railVisible;
  useRootScrollLock(mobileDrawerOpen);

  useEffect(() => {
    // Closing the mobile drawer at the rail breakpoint prevents an invisible modal from retaining
    // focus after responsive navigation changes form.
    if (railVisible) setMobileOpen(false);
  }, [railVisible]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        [MAGIC_NAV_RAIL_MEDIA_QUERY]: {
          gridTemplateColumns: `${MAGIC_NAV_RAIL_WIDTH}px minmax(0, 1fr)`,
        },
      }}
    >
      {/* Public pages previously removed the global rail, leaving theme and accent controls with no
          reachable home. Reusing the internal rail geometry restores those controls consistently. */}
      <Box
        component="nav"
        aria-label="公开站导航"
        sx={{
          display: "none",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          borderRight: "1px solid",
          borderColor: "divider",
          backgroundColor: "var(--mui-palette-surface-containerLow)",
          // Unlike MUI Paper, this rail Box does not receive the theme's surface transition.
          // Matching the internal rail prevents an abrupt public-only flash on theme changes.
          transition: "background-color 250ms cubic-bezier(0.2, 0, 0, 1)",
          [MAGIC_NAV_RAIL_MEDIA_QUERY]: { display: "block" },
        }}
      >
        <PublicNavigationContent
          appVersion={appVersion}
          commitHash={commitHash}
          compact
          logoUrl={logoUrl}
        />
      </Box>

      <Drawer
        open={mobileDrawerOpen}
        onClose={() => setMobileOpen(false)}
        // Public navigation controls already exist in the desktop rail, so a closed mobile drawer
        // should release its duplicate themed controls and listeners.
        ModalProps={{ disableScrollLock: true }}
        slotProps={{
          paper: {
            sx: {
              width: "min(84vw, 304px)",
              overflowX: "hidden",
              borderTopRightRadius: "16px",
              borderBottomRightRadius: "16px",
              backgroundColor: "var(--mui-palette-surface-containerLow)",
            },
          },
        }}
      >
        {/* The desktop rail already exposes a nav landmark. The drawer needs its own landmark so
            mobile assistive navigation does not reduce the same controls to anonymous content. */}
        <Box component="nav" aria-label="公开站导航" sx={{ height: "100%" }}>
          <PublicNavigationContent
            appVersion={appVersion}
            commitHash={commitHash}
            compact={false}
            logoUrl={logoUrl}
          />
        </Box>
      </Drawer>

      <Box
        sx={{
          "--magic-public-app-bar-height": "56px",
          minWidth: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          [MAGIC_NAV_RAIL_MEDIA_QUERY]: { "--magic-public-app-bar-height": "0px" },
        }}
      >
        {/* The compact mark alone hid the public identity; the shared bar now keeps its title
            typography and spacing identical to the internal site. */}
        <MagicMobileNavigationBar logoUrl={logoUrl} onOpenNavigation={() => setMobileOpen(true)} />

        <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
          {children}
        </Box>
        {footer}
      </Box>
    </Box>
  );
}
