"use client";

import { useEffect } from "react";

let activeRootScrollLocks = 0;
let previousRootOverflow = "";
let previousRootScrollbarGutter = "";
let previousMainPaddingRight = "";
let lockedMain: HTMLElement | null = null;

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
      lockedMain = document.body.querySelector("main");
      previousMainPaddingRight = lockedMain?.style.paddingRight ?? "";

      const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
      root.style.scrollbarGutter = "auto";
      if (lockedMain && scrollbarWidth > 0) {
        // Compensate only application content so fixed overlay sheets still reach the viewport edge.
        lockedMain.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    activeRootScrollLocks += 1;
    root.style.overflow = "hidden";

    return () => {
      activeRootScrollLocks = Math.max(0, activeRootScrollLocks - 1);
      if (activeRootScrollLocks === 0) {
        root.style.overflow = previousRootOverflow;
        root.style.scrollbarGutter = previousRootScrollbarGutter;
        if (lockedMain) lockedMain.style.paddingRight = previousMainPaddingRight;
        lockedMain = null;
      }
    };
  }, [active]);
}
