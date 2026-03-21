"use client";

import { useMemo, useRef } from "react";
import { getFilmstripScrollbarMetrics } from "@magic-compare/compare-core";
import {
  type FilmstripScrollState,
} from "./filmstrip-drag-physics";
import { useFilmstripGestureSession } from "./use-filmstrip-gesture-session";
import { useFilmstripScrollState } from "./use-filmstrip-scroll-state";

/**
 * Encapsulates filmstrip drag physics so the workbench component can focus on viewer state instead
 * of pointer bookkeeping and overscroll math.
 */
export function useFilmstripDrag({
  frameCount,
  onSelectFrame,
  prefersReducedMotion,
}: {
  frameCount: number;
  onSelectFrame: (frameId: string) => void;
  prefersReducedMotion: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const filmstripScrollState: FilmstripScrollState = useFilmstripScrollState({
    frameCount,
    viewportRef,
  });
  const {
    edgeOffset,
    isDragging,
    handleFrameSelection,
    viewportHandlers,
  } = useFilmstripGestureSession({
    frameCount,
    onSelectFrame,
    prefersReducedMotion,
  });

  const scrollbarMetrics = useMemo(
    () =>
      getFilmstripScrollbarMetrics(
        filmstripScrollState.clientWidth,
        filmstripScrollState.scrollWidth,
        filmstripScrollState.scrollLeft,
      ),
    [filmstripScrollState],
  );

  return {
    edgeOffset,
    isDragging,
    scrollbarMetrics,
    viewportRef,
    handleFrameSelection,
    viewportHandlers,
  };
}
