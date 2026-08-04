"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Box, Fade, LinearProgress } from "@mui/material";
import { usePathname } from "next/navigation";
import { NAV_EXTENDED_WIDTH, NAV_RAIL_WIDTH } from "./internal-layout-constants";

const PROGRESS_FALLBACK_MS = 4000;
const ROUTE_EXIT_MS = 160;

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
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousRoute = useRef({ pathname, children });
  const routeChanged = previousRoute.current.pathname !== pathname;
  const visibleOutgoingChildren = routeChanged ? previousRoute.current.children : outgoingChildren;

  useLayoutEffect(() => {
    if (previousRoute.current.pathname === pathname) {
      previousRoute.current.children = children;
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
  }, [pathname]);

  useEffect(
    () => () => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  useEffect(() => {
    function startRouteFeedback(event: globalThis.MouseEvent) {
      if (!isRouteNavigation(event)) return;

      // Next can resolve prefetched pages before loading.tsx mounts, so navigation feedback starts
      // from every same-origin link, including links in the rail outside this content subtree.
      setNavigating(true);
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
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
            top: { xs: 56, sm: 0 },
            right: 0,
            left: { xs: 0, sm: NAV_RAIL_WIDTH, md: NAV_EXTENDED_WIDTH },
            height: 3,
            borderRadius: 0,
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
        key={pathname}
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
