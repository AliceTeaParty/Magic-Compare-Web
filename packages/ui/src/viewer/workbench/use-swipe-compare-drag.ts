"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ViewerMediaRect } from "@magic-compare/compare-core";
import {
  getSwipeCssValues,
  resolveSwipePositionFromPointer,
} from "./swipe-compare-geometry";

export type SwipeCssVariableWriter = (nextPosition: number) => void;

/** Pointer capture release is defensive because cancel/up can arrive after capture was lost. */
function releasePointerCapture(event: ReactPointerEvent<HTMLDivElement>) {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

/**
 * Owns transient swipe drag state outside React so pointermove updates only CSS variables, while
 * the released value still lands in React state for frame resets and persistence.
 */
export function useSwipeCompareDrag({
  axisLength,
  mediaRect,
  rotateStage,
  setSwipePosition,
  swipePosition,
}: {
  axisLength: number;
  mediaRect: ViewerMediaRect;
  rotateStage: boolean;
  setSwipePosition: (value: number) => void;
  swipePosition: number;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingSwipePositionRef = useRef(swipePosition);
  const transientSwipePositionRef = useRef(swipePosition);

  /** Cancels stale rAF writes before prop-driven resets or final release commits overwrite CSS vars. */
  function cancelPendingCssWrite() {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }

  const writeSwipeCssVariables = useCallback(
    (nextPosition: number) => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      const values = getSwipeCssValues({
        axisLength,
        position: nextPosition,
      });

      viewport.style.setProperty("--swipe-position", `${values.position}%`);
      viewport.style.setProperty("--swipe-ratio", `${values.ratio}`);
      viewport.style.setProperty("--swipe-offset", `${values.offset}px`);
    },
    [axisLength],
  );

  /**
   * Pointermove can fire faster than React should render; only the final released value is committed
   * to React state, while drag feedback goes through one rAF-batched CSS variable write.
   */
  function scheduleSwipeCssWrite(nextPosition: number) {
    pendingSwipePositionRef.current = nextPosition;

    if (animationFrameRef.current !== null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      writeSwipeCssVariables(pendingSwipePositionRef.current);
    });
  }

  useEffect(() => {
    transientSwipePositionRef.current = swipePosition;
    pendingSwipePositionRef.current = swipePosition;
    cancelPendingCssWrite();
    writeSwipeCssVariables(swipePosition);
  }, [swipePosition, writeSwipeCssVariables]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  function updateTransientSwipePosition({
    clientX,
    clientY,
    immediate,
  }: {
    clientX: number;
    clientY: number;
    immediate: boolean;
  }) {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const nextPosition = resolveSwipePositionFromPointer({
      clientX,
      clientY,
      mediaRect,
      rotateStage,
      viewportRect: viewport.getBoundingClientRect(),
    });
    if (nextPosition === null) {
      return;
    }

    transientSwipePositionRef.current = nextPosition;

    if (immediate) {
      writeSwipeCssVariables(nextPosition);
      return;
    }

    scheduleSwipeCssWrite(nextPosition);
  }

  /** Commits the last drag-time value exactly once when pointer capture ends. */
  function commitTransientSwipePosition() {
    cancelPendingCssWrite();
    writeSwipeCssVariables(transientSwipePositionRef.current);
    setSwipePosition(transientSwipePositionRef.current);
  }

  /**
   * Captures the pointer so the divider keeps tracking even when a drag leaves the visual handle.
   */
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateTransientSwipePosition({
      clientX: event.clientX,
      clientY: event.clientY,
      immediate: true,
    });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    updateTransientSwipePosition({
      clientX: event.clientX,
      clientY: event.clientY,
      immediate: false,
    });
  }

  /**
   * Commits the last transient value only on release, which keeps drag-time movement out of React.
   */
  function finishPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    releasePointerCapture(event);
    activePointerIdRef.current = null;
    commitTransientSwipePosition();
  }

  return {
    finishPointerDrag,
    handlePointerDown,
    handlePointerMove,
    viewportRef,
  };
}
