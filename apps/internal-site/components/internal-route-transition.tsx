"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Box, Fade, LinearProgress } from "@mui/material";
import { usePathname } from "next/navigation";
import { NAV_RAIL_MEDIA_QUERY, NAV_RAIL_WIDTH } from "./internal-layout-constants";

const PROGRESS_FALLBACK_MS = 4000;
const PROGRESS_REVEAL_MS = 180;
const ROUTE_EXIT_MS = 160;

/** Returns the shared Viewer route identity used while switching Groups inside one Case. */
function getViewerRouteScope(pathname: string): string | null {
  const match = pathname.match(/^\/cases\/([^/]+)\/groups\/[^/]+\/?$/);
  return match?.[1] ? `/cases/${match[1]}/groups` : null;
}

/** Keeps sibling Group viewers in one React subtree while unrelated pages remain independently keyed. */
function getRouteContentKey(pathname: string): string {
  return getViewerRouteScope(pathname) ?? pathname;
}

/** Sibling Viewer navigation updates content in place instead of replaying a whole-page transition. */
function isSiblingViewerNavigation(previousPathname: string, pathname: string): boolean {
  const previousScope = getViewerRouteScope(previousPathname);
  return previousScope !== null && previousScope === getViewerRouteScope(pathname);
}

function isRouteNavigation(event: globalThis.MouseEvent): boolean {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof Element)) return false;
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return false;

  const nextUrl = new URL(anchor.href, window.location.href);
  const currentUrl = new URL(window.location.href);
  if (nextUrl.origin !== currentUrl.origin) return false;

  return `${nextUrl.pathname}${nextUrl.search}` !== `${currentUrl.pathname}${currentUrl.search}`;
}

/** Shows immediate route progress and keeps each page entrance spatially connected to navigation. */
export function InternalRouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [navigating, setNavigating] = useState(false);
  const [outgoingChildren, setOutgoingChildren] = useState<ReactNode | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousRoute = useRef({ pathname, children });
  const routeChanged = previousRoute.current.pathname !== pathname;
  const siblingViewerNavigation =
    routeChanged && isSiblingViewerNavigation(previousRoute.current.pathname, pathname);
  const visibleOutgoingChildren = routeChanged
    ? siblingViewerNavigation
      ? null
      : previousRoute.current.children
    : outgoingChildren;

  useLayoutEffect(() => {
    if (previousRoute.current.pathname === pathname) {
      previousRoute.current.children = children;
      return;
    }

    if (isSiblingViewerNavigation(previousRoute.current.pathname, pathname)) {
      // Group links replace only the Viewer dataset. Preserving this subtree keeps the open
      // details pane and controller state while avoiding a duplicate outgoing Viewer.
      previousRoute.current = { pathname, children };
      if (exitTimer.current) clearTimeout(exitTimer.current);
      setOutgoingChildren(null);
      return;
    }

    // Keep the prior server-rendered page for the short exit phase so fast prefetched navigation
    // cannot remove it before the leftward relationship has been communicated.
    setOutgoingChildren(previousRoute.current.children);
    previousRoute.current = { pathname, children };
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => setOutgoingChildren(null), ROUTE_EXIT_MS);
  }, [children, pathname]);

  useEffect(() => {
    setNavigating(false);
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    if (progressRevealTimer.current) clearTimeout(progressRevealTimer.current);
  }, [pathname]);

  useEffect(
    () => () => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      if (progressRevealTimer.current) clearTimeout(progressRevealTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  useEffect(() => {
    function startRouteFeedback(event: globalThis.MouseEvent) {
      if (!isRouteNavigation(event)) return;

      // Fast prefetched Group changes should finish without flashing a progress line. Slower
      // navigation still gets one fixed, global indicator well inside the 400ms feedback window.
      setNavigating(false);
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      if (progressRevealTimer.current) clearTimeout(progressRevealTimer.current);
      progressRevealTimer.current = setTimeout(() => setNavigating(true), PROGRESS_REVEAL_MS);
      fallbackTimer.current = setTimeout(() => setNavigating(false), PROGRESS_FALLBACK_MS);
    }

    document.addEventListener("click", startRouteFeedback, true);
    return () => document.removeEventListener("click", startRouteFeedback, true);
  }, []);

  return (
    <Box component="section" sx={{ position: "relative", minWidth: 0, overflowX: "clip" }}>
      <Fade in={navigating} timeout={{ enter: 100, exit: 150 }}>
        <LinearProgress
          aria-label="正在切换页面"
          sx={{
            position: "fixed",
            zIndex: (theme) => theme.zIndex.appBar + 1,
            top: 56,
            right: 0,
            left: 0,
            height: 3,
            borderRadius: 0,
            [NAV_RAIL_MEDIA_QUERY]: { top: 0, left: NAV_RAIL_WIDTH },
          }}
        />
      </Fade>
      {visibleOutgoingChildren ? (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            minWidth: 0,
            pointerEvents: "none",
            animation: "mc-route-exit-left 160ms cubic-bezier(0.4, 0, 1, 1) both",
            "@keyframes mc-route-exit-left": {
              from: { opacity: 1, transform: "translate3d(0, 0, 0)" },
              to: { opacity: 0, transform: "translate3d(-12px, 0, 0)" },
            },
            "@media (prefers-reduced-motion: reduce)": { display: "none" },
          }}
        >
          {visibleOutgoingChildren}
        </Box>
      ) : null}
      <Box
        key={getRouteContentKey(pathname)}
        sx={{
          position: "relative",
          zIndex: 1,
          minWidth: 0,
          backgroundColor: "background.default",
          animation: "mc-route-enter-right 260ms cubic-bezier(0.16, 1, 0.3, 1) both",
          "@keyframes mc-route-enter-right": {
            from: { opacity: 0.94, transform: "translate3d(16px, 0, 0)" },
            to: { opacity: 1, transform: "translate3d(0, 0, 0)" },
          },
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
