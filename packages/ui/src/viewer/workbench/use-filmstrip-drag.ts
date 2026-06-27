"use client";

import {
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { getFilmstripScrollbarMetrics } from "@magic-compare/compare-core";
import { clampNumber } from "@magic-compare/shared-utils";
import { type FilmstripScrollState } from "./filmstrip-drag-physics";
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
  const stripRef = useRef<HTMLDivElement | null>(null);
  const scrollbarDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startScrollLeft: number;
  } | null>(null);
  const filmstripScrollState: FilmstripScrollState = useFilmstripScrollState({
    frameCount,
    viewportRef,
  });
  const { isDragging, handleFrameSelection, viewportHandlers } =
    useFilmstripGestureSession({
      frameCount,
      onSelectFrame,
      prefersReducedMotion,
      stripRef,
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

  const scrollTo = useCallback((nextScrollLeft: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    viewport.scrollLeft = clampNumber(nextScrollLeft, 0, maxScrollLeft);
  }, []);

  /**
   * Converts thumb dragging back into the native scroll position instead of maintaining a second
   * scrollbar state model that could drift from the viewport.
   */
  function handleScrollbarPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!scrollbarMetrics.visible) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    scrollbarDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startScrollLeft: viewportRef.current?.scrollLeft ?? 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  /**
   * Uses the rendered track width as the conversion basis so dragging the visible thumb maps
   * linearly onto the underlying native scroll range.
   */
  function handleScrollbarPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = scrollbarDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const trackWidth = event.currentTarget.clientWidth;
    const maxThumbOffset = Math.max(1, trackWidth - scrollbarMetrics.thumbWidth);
    const scrollDelta =
      ((event.clientX - dragState.startClientX) / maxThumbOffset) *
      scrollbarMetrics.maxScrollLeft;

    scrollTo(dragState.startScrollLeft + scrollDelta);
    event.preventDefault();
  }

  function finishScrollbarPointerDrag(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (scrollbarDragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    scrollbarDragRef.current = null;
  }

  /**
   * Gives the custom scrollbar the same coarse and fine keyboard movement users expect from a
   * native horizontal scrollbar while keeping the page-level shortcuts from also firing.
   */
  function handleScrollbarKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport || !scrollbarMetrics.visible) {
      return;
    }

    const smallStep = Math.max(48, viewport.clientWidth * 0.12);
    const largeStep = Math.max(160, viewport.clientWidth * 0.82);
    let nextScrollLeft: number | null = null;

    if (event.key === "ArrowLeft") {
      nextScrollLeft = viewport.scrollLeft - smallStep;
    } else if (event.key === "ArrowRight") {
      nextScrollLeft = viewport.scrollLeft + smallStep;
    } else if (event.key === "PageUp") {
      nextScrollLeft = viewport.scrollLeft - largeStep;
    } else if (event.key === "PageDown") {
      nextScrollLeft = viewport.scrollLeft + largeStep;
    } else if (event.key === "Home") {
      nextScrollLeft = 0;
    } else if (event.key === "End") {
      nextScrollLeft = scrollbarMetrics.maxScrollLeft;
    }

    if (nextScrollLeft === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    scrollTo(nextScrollLeft);
  }

  return {
    isDragging,
    scrollbarMetrics,
    scrollbarHandlers: {
      onKeyDown: handleScrollbarKeyDown,
      onPointerCancel: finishScrollbarPointerDrag,
      onPointerDown: handleScrollbarPointerDown,
      onPointerMove: handleScrollbarPointerMove,
      onPointerUp: finishScrollbarPointerDrag,
    },
    stripRef,
    viewportRef,
    handleFrameSelection,
    viewportHandlers,
  };
}
