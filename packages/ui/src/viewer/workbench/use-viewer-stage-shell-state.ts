"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  getViewerStageScrollPadding,
  getViewerStageShellHeight,
} from "./viewer-layout";
import { getViewportSize, type ViewportSize } from "./viewer-stage";

/**
 * Tracks outer stage sizing from live viewport and slot measurements so the workbench component
 * does not need to own the resize bookkeeping directly.
 */
export function useViewerStageShellState({
  aspectRatio,
  prefersReducedMotion,
  viewportSize,
}: {
  aspectRatio: number;
  prefersReducedMotion: boolean;
  viewportSize: ViewportSize;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageSlotRef = useRef<HTMLDivElement | null>(null);
  const [stageSlotWidth, setStageSlotWidth] = useState(0);
  const shellHeight = useMemo(
    () =>
      getViewerStageShellHeight({
        viewportSize,
        availableWidth: stageSlotWidth,
        aspectRatio,
      }),
    [aspectRatio, stageSlotWidth, viewportSize],
  );

  useEffect(() => {
    const stageSlotNode = stageSlotRef.current;
    if (!stageSlotNode) {
      return;
    }

    function syncStageSlotWidth() {
      const nextStageSlotNode = stageSlotRef.current;
      if (!nextStageSlotNode) {
        return;
      }

      setStageSlotWidth(nextStageSlotNode.clientWidth);
    }

    syncStageSlotWidth();
    const observer = new ResizeObserver(syncStageSlotWidth);
    observer.observe(stageSlotNode);
    return () => observer.disconnect();
  }, []);

  const scrollStageIntoView = useCallback(() => {
    const stageNode = stageRef.current;
    if (!stageNode || typeof window === "undefined") {
      return;
    }

    const nextViewportSize = getViewportSize();
    const scrollPadding = getViewerStageScrollPadding(nextViewportSize);
    const stageTop =
      window.scrollY + stageNode.getBoundingClientRect().top - scrollPadding;

    window.scrollTo({
      top: Math.max(0, stageTop),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [prefersReducedMotion]);

  return useMemo(
    () => ({
      scrollStageIntoView,
      stageRef: stageRef as RefObject<HTMLDivElement | null>,
      stageSlotRef,
      shellHeight,
    }),
    [scrollStageIntoView, shellHeight],
  );
}
