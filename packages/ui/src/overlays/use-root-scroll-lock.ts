"use client";

import { useEffect } from "react";

let activeRootScrollLocks = 0;
let previousRootOverflow = "";
let previousRootScrollbarGutter = "";

/**
 * Locks the document root without MUI's body padding compensation. A shared count keeps nested
 * dialogs and drawers from restoring scrolling until the last blocking surface closes.
 */
export function useRootScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const root = document.documentElement;
    if (activeRootScrollLocks === 0) {
      previousRootOverflow = root.style.overflow;
      previousRootScrollbarGutter = root.style.scrollbarGutter;
      // Keep the root's reserved scrollbar slot while scrolling is blocked. Removing the stable
      // gutter made centered grids expand by one scrollbar width whenever a Dialog opened.
      root.style.scrollbarGutter = "stable";
    }

    activeRootScrollLocks += 1;
    root.style.overflow = "hidden";

    return () => {
      activeRootScrollLocks = Math.max(0, activeRootScrollLocks - 1);
      if (activeRootScrollLocks === 0) {
        root.style.overflow = previousRootOverflow;
        root.style.scrollbarGutter = previousRootScrollbarGutter;
      }
    };
  }, [active]);
}
