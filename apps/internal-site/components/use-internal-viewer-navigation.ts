"use client";

import type { ViewerDataset } from "@magic-compare/compare-core/viewer-data";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppNotifications } from "./notifications/use-app-notifications";
import { ViewerDatasetCache, ViewerDatasetRequestRegistry } from "./viewer-dataset-cache";

type HistoryMode = "none" | "push";

interface ViewerRouteTarget {
  caseSlug: string;
  groupSlug: string;
  pathname: string;
}

/** Parses only same-origin internal Group routes so History never receives an unchecked href. */
function parseViewerRouteTarget(href: string): ViewerRouteTarget | null {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;

    const match = url.pathname.match(/^\/cases\/([^/]+)\/groups\/([^/]+)\/?$/);
    if (!match?.[1] || !match[2]) return null;

    return {
      caseSlug: decodeURIComponent(match[1]),
      groupSlug: decodeURIComponent(match[2]),
      pathname: url.pathname,
    };
  } catch {
    return null;
  }
}

/** Loads the same dataset as the direct route while leaving the mounted Viewer shell untouched. */
async function requestViewerDataset(
  target: ViewerRouteTarget,
  signal: AbortSignal,
): Promise<ViewerDataset> {
  const response = await fetch("/api/ops/group-viewer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ caseSlug: target.caseSlug, groupSlug: target.groupSlug }),
    signal,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.dataset) {
    throw new Error(payload?.error || "加载 Group 失败。");
  }

  return payload.dataset as ViewerDataset;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Returns the canonical internal href already supplied by the server's sibling navigation data. */
function getCurrentDatasetHref(dataset: ViewerDataset): string {
  return (
    dataset.siblingGroups.find((group) => group.isCurrent)?.href ??
    `/cases/${encodeURIComponent(dataset.caseMeta.slug)}/groups/${encodeURIComponent(dataset.group.slug)}`
  );
}

/**
 * Keeps one Viewer mounted while sibling datasets are prefetched, cached, and committed. Native
 * History updates preserve meaningful URLs without asking Next to replace the dynamic page payload.
 */
export function useInternalViewerNavigation(initialDataset: ViewerDataset) {
  const { pushNotification } = useAppNotifications();
  const [dataset, setDataset] = useState(initialDataset);
  const [pendingGroupHref, setPendingGroupHref] = useState<string | null>(null);
  const activeHrefRef = useRef(getCurrentDatasetHref(initialDataset));
  const cacheRef = useRef(new ViewerDatasetCache([[activeHrefRef.current, initialDataset]]));
  const requestRegistryRef = useRef(new ViewerDatasetRequestRegistry<ViewerDataset>());
  const navigationSequenceRef = useRef(0);

  /** Deduplicates pointer, focus, and click intent so each target produces at most one request. */
  const loadDataset = useCallback((target: ViewerRouteTarget, speculative: boolean) => {
    const cached = cacheRef.current.get(target.pathname);
    if (cached) return Promise.resolve(cached);

    return requestRegistryRef.current.load(target.pathname, speculative, (signal) =>
      requestViewerDataset(target, signal).then((nextDataset) => {
        cacheRef.current.set(target.pathname, nextDataset, activeHrefRef.current);
        return nextDataset;
      }),
    );
  }, []);

  /** Warms route data before click while the shared image preloader handles first-frame assets. */
  const prefetchGroup = useCallback(
    (href: string) => {
      const target = parseViewerRouteTarget(href);
      if (!target || target.caseSlug !== initialDataset.caseMeta.slug) return;
      void loadDataset(target, true).catch(() => undefined);
    },
    [initialDataset.caseMeta.slug, loadDataset],
  );

  /** Commits only the newest navigation request so rapid Group changes cannot render stale data. */
  const navigateGroup = useCallback(
    async (href: string, historyMode: HistoryMode = "push") => {
      const target = parseViewerRouteTarget(href);
      if (!target || target.caseSlug !== initialDataset.caseMeta.slug) return;
      if (target.pathname === activeHrefRef.current) {
        // Re-selecting the current row is a real cancellation intent while another row loads.
        navigationSequenceRef.current += 1;
        setPendingGroupHref(null);
        return;
      }

      const sequence = navigationSequenceRef.current + 1;
      navigationSequenceRef.current = sequence;
      setPendingGroupHref(target.pathname);

      try {
        const nextDataset = await loadDataset(target, false);
        if (sequence !== navigationSequenceRef.current) return;

        activeHrefRef.current = target.pathname;
        setDataset(nextDataset);
        if (historyMode === "push") {
          // Next officially integrates native History entries with usePathname while avoiding a
          // second Server Component navigation for this already-loaded Viewer dataset.
          window.history.pushState(null, "", target.pathname);
        }
      } catch (error) {
        if (sequence !== navigationSequenceRef.current) return;
        if (isAbortError(error)) return;
        pushNotification(error instanceof Error ? error.message : "加载 Group 失败。", "error");
      } finally {
        if (sequence === navigationSequenceRef.current) setPendingGroupHref(null);
      }
    },
    [initialDataset.caseMeta.slug, loadDataset, pushNotification],
  );

  useEffect(() => {
    /** Browser back/forward reuses the same cache and mounted Viewer for sibling Group entries. */
    function handlePopState() {
      const target = parseViewerRouteTarget(window.location.href);
      if (!target || target.caseSlug !== initialDataset.caseMeta.slug) return;
      void navigateGroup(target.pathname, "none");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [initialDataset.caseMeta.slug, navigateGroup]);

  useEffect(
    () => () => {
      requestRegistryRef.current.abortAll();
    },
    [],
  );

  return {
    dataset,
    navigateGroup: (href: string) => void navigateGroup(href),
    pendingGroupHref,
    prefetchGroup,
  };
}
