"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  getFilmstripScrollState,
  type FilmstripScrollState,
} from "./filmstrip-drag-physics";

/**
 * Scrollbar metrics have to follow live DOM layout, so this hook watches the viewport element
 * directly instead of guessing from frame data alone.
 */
export function useFilmstripScrollState({
  frameCount,
  viewportRef,
}: {
  frameCount: number;
  viewportRef: RefObject<HTMLDivElement | null>;
}): FilmstripScrollState {
  const [filmstripScrollState, setFilmstripScrollState] = useState<FilmstripScrollState>({
    clientWidth: 0,
    scrollLeft: 0,
    scrollWidth: 0,
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    /**
     * Scroll metrics come from the viewport DOM node because drag physics depend on the rendered
     * width after layout, not just the React tree that requested it.
     */
    function syncScrollState() {
      const element = viewportRef.current;
      if (!element) {
        return;
      }

      setFilmstripScrollState(getFilmstripScrollState(element));
    }

    syncScrollState();
    viewport.addEventListener("scroll", syncScrollState, { passive: true });
    const observer = new ResizeObserver(syncScrollState);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", syncScrollState);
      observer.disconnect();
    };
  }, [frameCount, viewportRef]);

  return filmstripScrollState;
}
