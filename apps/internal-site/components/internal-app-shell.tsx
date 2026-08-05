"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CloudSyncOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  FolderCopyOutlined,
  Menu,
} from "@mui/icons-material";
import {
  AppBar,
  Box,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  List,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { MagicThemeControls, useRootScrollLock } from "@magic-compare/ui";
import { usePathname } from "next/navigation";
import { CaseCreateButton } from "./case-create-button";
import {
  NAV_RAIL_MEDIA_QUERY,
  NAV_RAIL_MIN_WIDTH,
  NAV_RAIL_WIDTH,
} from "./internal-layout-constants";
import { InternalNavigationItem } from "./internal-navigation-item";
import { InternalRouteTransition } from "./internal-route-transition";
import { AppNotifications } from "./notifications/app-notifications";
import { useAppNotifications } from "./notifications/use-app-notifications";
import {
  notifyBrowserDeploySuccess,
  requestBrowserDeployNotificationPermission,
} from "./case-workspace/browser-deploy-notifications";

const destinations = [
  { href: "/", label: "Case", icon: <FolderCopyOutlined /> },
  { href: "/upload", label: "上传", icon: <CloudUploadOutlined /> },
] as const;

function isDestinationActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Returns the current Case workspace path while preserving the route's encoded slug. */
function getCurrentCaseWorkspaceHref(pathname: string) {
  const caseSlug = pathname.match(/^\/cases\/([^/]+)/)?.[1];
  return caseSlug ? `/cases/${caseSlug}` : null;
}

/** Uses one navigation model for the modal drawer and compact desktop rail. */
function NavigationContent({
  isDeployingPublicSite,
  onDeployPublicSite,
  pathname,
  onNavigate,
}: {
  isDeployingPublicSite: boolean;
  onDeployPublicSite: () => void;
  pathname: string;
  onNavigate?: () => void;
}) {
  const currentCaseWorkspaceHref = getCurrentCaseWorkspaceHref(pathname);

  return (
    <Stack sx={{ height: "100%", minHeight: 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          // The compact rail has no wordmark, so its logo must be centered in the full 80px
          // column. The modal drawer gets a real leading inset instead of touching the viewport.
          justifyContent: "flex-start",
          height: 72,
          px: 2,
          [NAV_RAIL_MEDIA_QUERY]: { justifyContent: "center", px: 0 },
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
          sx={{
            ml: 1.25,
            display: "block",
            whiteSpace: "nowrap",
            [NAV_RAIL_MEDIA_QUERY]: { display: "none" },
          }}
        >
          Magic Compare
        </Typography>
      </Box>

      <List sx={{ px: 1, py: 1, [NAV_RAIL_MEDIA_QUERY]: { px: 0.75 } }}>
        {destinations.flatMap((destination) => {
          const selected = isDestinationActive(pathname, destination.href);
          const destinationItem = (
            <InternalNavigationItem
              key={destination.href}
              href={destination.href}
              icon={destination.icon}
              label={destination.label}
              selected={selected}
              onClick={onNavigate}
            />
          );

          if (destination.href !== "/") return [destinationItem];

          // Workspace keeps a stable slot just like deployment. Without a current Case it remains
          // visible but unavailable; Case descendants enable the same destination in place.
          return [
            destinationItem,
            <InternalNavigationItem
              key="current-case-workspace"
              disabled={!currentCaseWorkspaceHref}
              href={currentCaseWorkspaceHref ?? undefined}
              icon={<DashboardOutlined />}
              label="工作区"
              selected={
                Boolean(currentCaseWorkspaceHref) &&
                (pathname === currentCaseWorkspaceHref ||
                  pathname.startsWith(`${currentCaseWorkspaceHref}/`))
              }
              onClick={onNavigate}
              title={currentCaseWorkspaceHref ? "当前 Case 工作区" : "进入 Case 后可打开工作区"}
            />,
          ];
        })}
        <CaseCreateButton navigation />
        {/* Deployment is a site-wide operation, so current-route Group data must not affect its
            position or availability. Only an active request temporarily disables repeat input. */}
        <InternalNavigationItem
          disabled={isDeployingPublicSite}
          emphasized={!isDeployingPublicSite}
          icon={
            isDeployingPublicSite ? (
              <CircularProgress color="inherit" size={20} thickness={5} />
            ) : (
              <CloudSyncOutlined />
            )
          }
          label="部署"
          onClick={() => {
            onDeployPublicSite();
            onNavigate?.();
          }}
          title={isDeployingPublicSite ? "正在部署 Pages" : "部署 Pages"}
        />
      </List>

      <Stack spacing={1} sx={{ mt: "auto", p: 1.5, [NAV_RAIL_MEDIA_QUERY]: { p: 1 } }}>
        <Divider />
        <Box sx={{ display: "block", [NAV_RAIL_MEDIA_QUERY]: { display: "none" } }}>
          <MagicThemeControls />
        </Box>
        <Box sx={{ display: "none", [NAV_RAIL_MEDIA_QUERY]: { display: "block" } }}>
          <MagicThemeControls compact />
        </Box>
      </Stack>
    </Stack>
  );
}

/** Provides one adaptive scaffold so route changes replace content without moving global chrome. */
export function InternalAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const railVisible = useMediaQuery(`(min-width:${NAV_RAIL_MIN_WIDTH}px)`);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDeployingPublicSite, setIsDeployingPublicSite] = useState(false);
  const { dismissNotification, notifications, pushNotification } = useAppNotifications();
  const mobileDrawerOpen = mobileOpen && !railVisible;
  useRootScrollLock(mobileDrawerOpen);

  useEffect(() => {
    // Crossing the content-driven rail breakpoint must not leave the modal drawer over the page.
    if (railVisible) setMobileOpen(false);
  }, [railVisible]);

  /** Deploys the full published site without coupling availability to whichever route is open. */
  async function deployPublicSite() {
    if (isDeployingPublicSite) return;

    requestBrowserDeployNotificationPermission();
    setIsDeployingPublicSite(true);
    pushNotification("正在部署公开站点…", "info", {
      key: "public-site-deploying",
      sticky: true,
    });

    try {
      // Omitting caseId preserves every published Case and avoids treating the current route as
      // the deployment source of truth.
      const response = await fetch("/api/ops/public-deploy", { method: "POST" });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "部署公开站点失败。");
      }

      const projectName = result?.projectName || "Cloudflare Pages";
      pushNotification(`已部署到 ${projectName}。`, "success");
      notifyBrowserDeploySuccess(projectName);
    } catch (error) {
      pushNotification(error instanceof Error ? error.message : "部署公开站点失败。", "error");
    } finally {
      dismissNotification("public-site-deploying");
      setIsDeployingPublicSite(false);
    }
  }

  return (
    <>
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          [NAV_RAIL_MEDIA_QUERY]: {
            gridTemplateColumns: `${NAV_RAIL_WIDTH}px minmax(0, 1fr)`,
          },
        }}
      >
        <Box
          component="nav"
          sx={{
            display: "none",
            position: "sticky",
            top: 0,
            height: "100vh",
            overflow: "hidden",
            borderRight: "1px solid",
            borderColor: "divider",
            backgroundColor: "var(--mui-palette-surface-containerLow)",
            transition: "background-color 250ms cubic-bezier(0.2, 0, 0, 1)",
            [NAV_RAIL_MEDIA_QUERY]: { display: "block" },
          }}
        >
          <NavigationContent
            isDeployingPublicSite={isDeployingPublicSite}
            onDeployPublicSite={() => void deployPublicSite()}
            pathname={pathname}
          />
        </Box>

        <Drawer
          open={mobileDrawerOpen}
          onClose={() => setMobileOpen(false)}
          // The shared root lock avoids MUI's body padding while preserving modal scroll blocking.
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
          <NavigationContent
            isDeployingPublicSite={isDeployingPublicSite}
            onDeployPublicSite={() => void deployPublicSite()}
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
          />
        </Drawer>

        <Box sx={{ minWidth: 0 }}>
          <AppBar
            position="sticky"
            elevation={0}
            color="transparent"
            sx={{
              display: "block",
              height: 56,
              borderBottom: "1px solid",
              borderColor: "divider",
              // A fully opaque app bar prevents scrolling content from bleeding into text and icons at
              // the viewport edge, which was especially visible in the narrow workbench layout.
              backgroundColor: "var(--mui-palette-surface-container)",
              [NAV_RAIL_MEDIA_QUERY]: { display: "none" },
            }}
          >
            <Toolbar disableGutters sx={{ minHeight: "56px !important", px: 1.5 }}>
              <IconButton
                aria-label="打开导航"
                onClick={() => setMobileOpen(true)}
                sx={{ mr: 0.75 }}
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
      <AppNotifications notifications={notifications} onDismiss={dismissNotification} />
    </>
  );
}
