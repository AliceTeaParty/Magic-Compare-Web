"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Menu } from "@mui/icons-material";
import {
  AppBar,
  Box,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Toolbar,
  useMediaQuery,
} from "@mui/material";
import { useRootScrollLock } from "../overlays/use-root-scroll-lock";
import { MagicThemeControls } from "../theme/magic-theme-controls";
import {
  MAGIC_NAV_RAIL_MEDIA_QUERY,
  MAGIC_NAV_RAIL_MIN_WIDTH,
  MAGIC_NAV_RAIL_WIDTH,
  MagicBuildVersionLabel,
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
        ModalProps={{ keepMounted: true, disableScrollLock: true }}
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
        <AppBar
          position="sticky"
          elevation={0}
          color="transparent"
          sx={{
            display: "block",
            height: 56,
            borderBottom: "1px solid",
            borderColor: "divider",
            backgroundColor: "var(--mui-palette-surface-container)",
            [MAGIC_NAV_RAIL_MEDIA_QUERY]: { display: "none" },
          }}
        >
          <Toolbar disableGutters sx={{ minHeight: "56px !important", px: 1.5 }}>
            <IconButton aria-label="打开导航" onClick={() => setMobileOpen(true)} sx={{ mr: 0.75 }}>
              <Menu />
            </IconButton>
            <MagicNavigationLogo logoUrl={logoUrl} size={32} />
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
          {children}
        </Box>
        {footer}
      </Box>
    </Box>
  );
}
