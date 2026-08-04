"use client";

import { useState, type ReactNode } from "react";
import { CloudUploadOutlined, FolderCopyOutlined, Menu } from "@mui/icons-material";
import {
  AppBar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { MagicThemeControls } from "@magic-compare/ui";
import { usePathname } from "next/navigation";
import { CaseCreateButton } from "./case-create-button";
import { NAV_EXTENDED_WIDTH, NAV_RAIL_WIDTH } from "./internal-layout-constants";
import { InternalNavigationItem } from "./internal-navigation-item";
import { InternalRouteTransition } from "./internal-route-transition";

const destinations = [
  { href: "/", label: "Case", icon: <FolderCopyOutlined /> },
  { href: "/upload", label: "上传", icon: <CloudUploadOutlined /> },
] as const;

function isDestinationActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/cases/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Uses one navigation model for the modal drawer, rail, and extended rail. */
function NavigationContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <Stack sx={{ height: "100%", minHeight: 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          height: 72,
          px: { sm: 1.5, md: 2 },
        }}
      >
        <Box
          sx={{
            display: "grid",
            placeItems: "center",
            width: 36,
            height: 36,
            flex: "0 0 auto",
            borderRadius: "12px",
            color: "primary.contrastText",
            backgroundColor: "primary.main",
            fontWeight: 750,
          }}
        >
          M
        </Box>
        <Typography
          variant="subtitle1"
          sx={{ ml: 1.25, display: { xs: "block", sm: "none", md: "block" }, whiteSpace: "nowrap" }}
        >
          Magic Compare
        </Typography>
      </Box>

      <List sx={{ px: { xs: 1, sm: 0.75, md: 1 }, py: 1 }}>
        {destinations.map((destination) => {
          const selected = isDestinationActive(pathname, destination.href);
          return (
            <InternalNavigationItem
              key={destination.href}
              href={destination.href}
              icon={destination.icon}
              label={destination.label}
              selected={selected}
              onClick={onNavigate}
            />
          );
        })}
        <CaseCreateButton navigation />
      </List>

      <Stack spacing={1.25} sx={{ mt: "auto", p: { xs: 1.5, sm: 1, md: 1.5 } }}>
        <Divider />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: { xs: "block", sm: "none", md: "block" }, px: 0.5 }}
        >
          外观
        </Typography>
        <Box sx={{ display: { xs: "block", sm: "none", md: "block" } }}>
          <MagicThemeControls />
        </Box>
        <Box sx={{ display: { xs: "none", sm: "block", md: "none" } }}>
          <MagicThemeControls compact />
        </Box>
      </Stack>
    </Stack>
  );
}

/** Provides one adaptive scaffold so route changes replace content without moving global chrome. */
export function InternalAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          sm: `${NAV_RAIL_WIDTH}px minmax(0, 1fr)`,
          md: `${NAV_EXTENDED_WIDTH}px minmax(0, 1fr)`,
        },
      }}
    >
      <Box
        component="nav"
        sx={{
          display: { xs: "none", sm: "block" },
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          borderRight: "1px solid",
          borderColor: "divider",
          backgroundColor: "var(--mui-palette-surface-containerLow)",
          transition: "background-color 250ms cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        <NavigationContent pathname={pathname} />
      </Box>

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: "min(84vw, 304px)",
              backgroundColor: "var(--mui-palette-surface-containerLow)",
            },
          },
        }}
      >
        <NavigationContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      <Box sx={{ minWidth: 0 }}>
        <AppBar
          position="sticky"
          elevation={0}
          color="transparent"
          sx={{
            display: { xs: "block", sm: "none" },
            height: 56,
            borderBottom: "1px solid",
            borderColor: "divider",
            // A fully opaque app bar prevents scrolling content from bleeding into text and icons at
            // the viewport edge, which was especially visible in the narrow workbench layout.
            backgroundColor: "var(--mui-palette-surface-container)",
          }}
        >
          <Toolbar
            disableGutters
            sx={{ minHeight: "56px !important", px: 1.5 }}
          >
            <IconButton
              aria-label="打开导航"
              onClick={() => setMobileOpen(true)}
              sx={{ display: { xs: "inline-flex", sm: "none" }, mr: 0.75 }}
            >
              <Menu />
            </IconButton>
            <Typography variant="subtitle1" sx={{ flex: 1, minWidth: 0 }} noWrap>
              Magic Compare
            </Typography>
          </Toolbar>
        </AppBar>
        <InternalRouteTransition>{children}</InternalRouteTransition>
      </Box>
    </Box>
  );
}
