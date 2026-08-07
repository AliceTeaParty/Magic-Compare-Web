"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CloudSyncOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  FolderCopyOutlined,
} from "@mui/icons-material";
import {
  Box,
  CircularProgress,
  Divider,
  Drawer,
  List,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import {
  MagicBuildVersionLabel,
  MagicMobileNavigationBar,
  MagicNavigationLogo,
  MagicThemeControls,
  useRootScrollLock,
} from "@magic-compare/ui";
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

/** Uses one navigation model for the modal drawer and compact desktop rail. */
function NavigationContent({
  appVersion,
  commitHash,
  isDeployingPublicSite,
  logoUrl,
  onDeployPublicSite,
  pathname,
  onNavigate,
}: {
  appVersion?: string | null;
  commitHash?: string | null;
  isDeployingPublicSite: boolean;
  logoUrl?: string | null;
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
        {/* The hard-coded M could not represent separate internal/public identities. A URL-backed
            shared mark keeps both shells configurable while retaining the original fallback. */}
        <MagicNavigationLogo logoUrl={logoUrl} />
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
        <Box sx={{ display: "block", [NAV_RAIL_MEDIA_QUERY]: { display: "none" } }}>
          <MagicBuildVersionLabel appVersion={appVersion} commitHash={commitHash} />
        </Box>
        <Box sx={{ display: "none", [NAV_RAIL_MEDIA_QUERY]: { display: "block" } }}>
          <MagicBuildVersionLabel appVersion={appVersion} commitHash={commitHash} compact />
        </Box>
      </Stack>
    </Stack>
  );
}

/** Provides one adaptive scaffold so route changes replace content without moving global chrome. */
function InternalAppShellScaffold({
  appVersion,
  children,
  commitHash,
  logoUrl,
}: {
  appVersion?: string | null;
  children: ReactNode;
  commitHash?: string | null;
  logoUrl?: string | null;
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
            logoUrl={logoUrl}
            onDeployPublicSite={() => void publicDeploy.startDeploy()}
            pathname={pathname}
          />
        </Box>

        <Drawer
          open={mobileDrawerOpen}
          onClose={() => setMobileOpen(false)}
          // The shared root lock avoids MUI's body padding while preserving modal scroll blocking.
          // The rail remains mounted on desktop; unmounting the closed mobile copy avoids duplicate
          // navigation controls while the shell keeps ownership of root scroll locking.
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
          <NavigationContent
            appVersion={appVersion}
            commitHash={commitHash}
            isDeployingPublicSite={publicDeploy.isDeploying}
            logoUrl={logoUrl}
            onDeployPublicSite={() => void publicDeploy.startDeploy()}
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
          />
        </Drawer>

        <Box sx={{ minWidth: 0 }}>
          <MagicMobileNavigationBar
            logoUrl={logoUrl}
            onOpenNavigation={() => setMobileOpen(true)}
          />
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
  logoUrl,
}: {
  appVersion?: string | null;
  children: ReactNode;
  commitHash?: string | null;
  logoUrl?: string | null;
}) {
  return (
    <AppNotificationsProvider>
      <InternalAppShellScaffold appVersion={appVersion} commitHash={commitHash} logoUrl={logoUrl}>
        {children}
      </InternalAppShellScaffold>
    </AppNotificationsProvider>
  );
}
