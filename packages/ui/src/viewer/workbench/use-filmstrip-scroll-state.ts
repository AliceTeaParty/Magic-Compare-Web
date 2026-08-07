"use client";

import { getFilmstripScrollbarMetrics } from "@magic-compare/compare-core";
import { useEffect, useRef, useState, type RefObject } from "react";
import { getFilmstripScrollState, type FilmstripScrollState } from "./filmstrip-drag-physics";
import { shouldUpdateFilmstripRenderState } from "./filmstrip-window";

/**
 * Keeps native scroll position as the source of truth. React updates only when virtualization or
 * layout changes, while the custom scrollbar follows every animation frame through CSS variables.
 */
export function useFilmstripScrollState({
  frameCount,
  scrollbarRef,
  viewportRef,
}: {
  frameCount: number;
  scrollbarRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
}): FilmstripScrollState {
  const [filmstripScrollState, setFilmstripScrollState] = useState<FilmstripScrollState>({
    clientWidth: 0,
    scrollLeft: 0,
    scrollWidth: 0,
  });
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    /** Reads layout once, then performs direct visual writes before deciding whether React cares. */
    function syncScrollState() {
      const element = viewportRef.current;
      if (!element) {
        return;
      }

      const nextState = getFilmstripScrollState(element);
      const metrics = getFilmstripScrollbarMetrics(
        nextState.clientWidth,
        nextState.scrollWidth,
        nextState.scrollLeft,
      );
      const scrollbar = scrollbarRef.current;
      if (scrollbar) {
        scrollbar.style.setProperty("--filmstrip-thumb-width", `${metrics.thumbWidth}px`);
        scrollbar.style.setProperty("--filmstrip-thumb-offset", `${metrics.thumbOffset}px`);
        scrollbar.setAttribute("aria-valuemax", `${Math.round(metrics.maxScrollLeft)}`);
        scrollbar.setAttribute("aria-valuenow", `${Math.round(metrics.scrollLeft)}`);
      }

      setFilmstripScrollState((currentState) => {
        return shouldUpdateFilmstripRenderState(currentState, nextState, frameCount)
          ? nextState
          : currentState;
      });
    }

    function scheduleScrollSync() {
      if (animationFrameRef.current !== null) {
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;
        syncScrollState();
      });
    }

    syncScrollState();
    viewport.addEventListener("scroll", scheduleScrollSync, { passive: true });
    const observer = new ResizeObserver(scheduleScrollSync);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", scheduleScrollSync);
      observer.disconnect();
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [frameCount, scrollbarRef, viewportRef]);

  return filmstripScrollState;
}
