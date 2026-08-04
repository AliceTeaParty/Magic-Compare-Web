"use client";

import { useState, type ReactNode } from "react";
import { CloudUploadOutlined, FolderCopyOutlined, Menu } from "@mui/icons-material";
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { MagicThemeControls } from "@magic-compare/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaseCreateButton } from "./case-create-button";

const NAV_RAIL_WIDTH = 80;
const NAV_EXTENDED_WIDTH = 224;

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
          height: 64,
          px: { sm: 1.5, md: 2 },
          borderBottom: "1px solid",
          borderColor: "divider",
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

      <Box sx={{ p: { xs: 1.5, sm: 1, md: 1.5 }, textAlign: "center" }}>
        <CaseCreateButton navigation />
      </Box>

      <List sx={{ px: { xs: 1, sm: 0.75, md: 1.25 }, py: 0.5 }}>
        {destinations.map((destination) => {
          const selected = isDestinationActive(pathname, destination.href);
          return (
            <ListItemButton
              key={destination.href}
              component={Link}
              href={destination.href}
              selected={selected}
              onClick={onNavigate}
              sx={{
                minHeight: { sm: 56, md: 48 },
                mb: 0.5,
                borderRadius: { sm: 3, md: 3 },
                flexDirection: { sm: "column", md: "row" },
                justifyContent: { sm: "center", md: "flex-start" },
                gap: { sm: 0.25, md: 0 },
                px: { sm: 0.5, md: 1.5 },
                color: selected ? "secondary.contrastText" : "text.secondary",
                "&.Mui-selected": { backgroundColor: "secondary.main" },
                "&.Mui-selected:hover": {
                  backgroundColor:
                    "color-mix(in srgb, currentColor 8%, var(--mui-palette-secondary-main))",
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: { sm: 0, md: 36 },
                  color: "inherit",
                  justifyContent: "center",
                }}
              >
                {destination.icon}
              </ListItemIcon>
              <ListItemText
                primary={destination.label}
                slotProps={{
                  primary: {
                    variant: "body2",
                    sx: { fontWeight: selected ? 650 : 550, whiteSpace: "nowrap" },
                  },
                }}
                sx={{ m: 0, display: { sm: "none", md: "block" } }}
              />
            </ListItemButton>
          );
        })}
      </List>
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
            height: 64,
            borderBottom: "1px solid",
            borderColor: "divider",
            // A fully opaque app bar prevents scrolling content from bleeding into text and icons at
            // the viewport edge, which was especially visible in the narrow workbench layout.
            backgroundColor: "var(--mui-palette-surface-container)",
          }}
        >
          <Toolbar
            disableGutters
            sx={{ minHeight: "64px !important", px: { xs: 1.5, sm: 2, lg: 3 } }}
          >
            <IconButton
              aria-label="打开导航"
              onClick={() => setMobileOpen(true)}
              sx={{ display: { xs: "inline-flex", sm: "none" }, mr: 0.75 }}
            >
              <Menu />
            </IconButton>
            <Typography variant="subtitle1" sx={{ flex: 1, minWidth: 0 }} noWrap>
              内部工作台
            </Typography>
            <MagicThemeControls />
          </Toolbar>
        </AppBar>
        <Box component="section" sx={{ minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
