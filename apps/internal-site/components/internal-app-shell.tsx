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
  Tooltip,
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
import { AppNotificationsProvider } from "./notifications/app-notifications-provider";
import { PublicDeployTaskPanel } from "./public-deploy/public-deploy-task-panel";
import { usePublicDeployJob } from "./public-deploy/use-public-deploy-job";

const destinations = [
  { href: "/", label: "Case", icon: <FolderCopyOutlined />, iconFeedback: "case" },
  {
    href: "/upload",
    label: "上传",
    icon: <CloudUploadOutlined />,
    iconFeedback: "upload",
  },
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

/** Keeps build identity in the persistent utility area without turning it into page content. */
function BuildVersionLabel({
  appVersion,
  commitHash,
}: {
  appVersion?: string | null;
  commitHash?: string | null;
}) {
  if (!appVersion) return null;

  const shortLabel = `v${appVersion}`;
  const fullLabel = commitHash
    ? `Magic Compare ${shortLabel} (${commitHash})`
    : `Magic Compare ${shortLabel}`;

  return (
    <Tooltip title={fullLabel} placement="right">
      <Typography
        component="div"
        variant="caption"
        sx={{
          width: "100%",
          px: 0.75,
          color: "text.disabled",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.4,
          textAlign: "left",
          whiteSpace: "nowrap",
          [NAV_RAIL_MEDIA_QUERY]: { px: 0, textAlign: "center" },
        }}
      >
        {shortLabel}
      </Typography>
    </Tooltip>
  );
}

/** Uses one navigation model for the modal drawer and compact desktop rail. */
function NavigationContent({
  appVersion,
  commitHash,
  isDeployingPublicSite,
  onDeployPublicSite,
  pathname,
  onNavigate,
}: {
  appVersion?: string | null;
  commitHash?: string | null;
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
              iconFeedback={destination.iconFeedback}
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
              iconFeedback="workspace"
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
        {/* Deployment keeps a stable global slot. While running, repeat input reopens the task
            surface instead of changing navigation geometry or starting a second build. */}
        <InternalNavigationItem
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
          title={isDeployingPublicSite ? "查看部署进度" : "部署 Pages"}
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
        <BuildVersionLabel appVersion={appVersion} commitHash={commitHash} />
      </Stack>
    </Stack>
  );
}

/** Provides one adaptive scaffold so route changes replace content without moving global chrome. */
function InternalAppShellScaffold({
  appVersion,
  children,
  commitHash,
}: {
  appVersion?: string | null;
  children: ReactNode;
  commitHash?: string | null;
}) {
  const pathname = usePathname();
  const railVisible = useMediaQuery(`(min-width:${NAV_RAIL_MIN_WIDTH}px)`);
  const [mobileOpen, setMobileOpen] = useState(false);
  const publicDeploy = usePublicDeployJob();
  const mobileDrawerOpen = mobileOpen && !railVisible;
  useRootScrollLock(mobileDrawerOpen);

  useEffect(() => {
    // Crossing the content-driven rail breakpoint must not leave the modal drawer over the page.
    if (railVisible) setMobileOpen(false);
  }, [railVisible]);

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
            appVersion={appVersion}
            commitHash={commitHash}
            isDeployingPublicSite={publicDeploy.isDeploying}
            onDeployPublicSite={() => void publicDeploy.startDeploy()}
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
            appVersion={appVersion}
            commitHash={commitHash}
            isDeployingPublicSite={publicDeploy.isDeploying}
            onDeployPublicSite={() => void publicDeploy.startDeploy()}
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
      <PublicDeployTaskPanel
        job={publicDeploy.job}
        open={publicDeploy.panelOpen}
        onClose={publicDeploy.closePanel}
        onRetry={() => void publicDeploy.startDeploy()}
      />
    </>
  );
}

/** Mounts the feedback provider above animated route content so every page shares one queue. */
export function InternalAppShell({
  appVersion,
  children,
  commitHash,
}: {
  appVersion?: string | null;
  children: ReactNode;
  commitHash?: string | null;
}) {
  return (
    <AppNotificationsProvider>
      <InternalAppShellScaffold appVersion={appVersion} commitHash={commitHash}>
        {children}
      </InternalAppShellScaffold>
    </AppNotificationsProvider>
  );
}
