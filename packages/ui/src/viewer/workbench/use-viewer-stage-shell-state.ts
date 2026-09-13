"use client";

import { useCallback, useMemo, useRef, type RefObject } from "react";
import { getViewerStageScrollPadding } from "./viewer-layout";
import { getViewportSize } from "./viewer-stage";

/**
 * Owns the stage anchor and fit-scroll behavior while CSS handles first-paint stage sizing.
 */
export function useViewerStageShellState({
  prefersReducedMotion,
}: {
  prefersReducedMotion: boolean;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);

  const scrollStageIntoView = useCallback(() => {
    const stageNode = stageRef.current;
    if (!stageNode || typeof window === "undefined") {
      return;
    }

    const nextViewportSize = getViewportSize();
    const scrollPadding = getViewerStageScrollPadding(nextViewportSize);
    const stageTop = window.scrollY + stageNode.getBoundingClientRect().top - scrollPadding;

    window.scrollTo({
      top: Math.max(0, stageTop),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [prefersReducedMotion]);

  return useMemo(
    () => ({
      scrollStageIntoView,
      stageRef: stageRef as RefObject<HTMLDivElement | null>,
    }),
    [scrollStageIntoView],
  );
}
