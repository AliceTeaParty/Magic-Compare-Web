"use client";

import type { MutableRefObject } from "react";
import { clampNumber } from "@magic-compare/shared-utils";

// These constants are tuned so the strip still feels responsive on touch devices without letting
// inertia fling the active frame far off screen.
const FILMSTRIP_EDGE_OFFSET_LIMIT = 36;
const FILMSTRIP_INERTIA_MIN_VELOCITY = 0.018;
const FILMSTRIP_INERTIA_VELOCITY_GAIN = 1.28;
const FILMSTRIP_MOUSE_DRAG_GAIN = 1.58;
const FILMSTRIP_TOUCH_DRAG_GAIN = 1.18;
const FILMSTRIP_OVERSCROLL_GAIN = 0.36;

export interface FilmstripScrollState {
  clientWidth: number;
  scrollLeft: number;
  scrollWidth: number;
}

export interface FilmstripDragState {
  lastClientX: number;
  lastTimestamp: number;
  moved: boolean;
  originFrameId: string | null;
  pointerId: number;
  startScrollLeft: number;
  startX: number;
}

export interface FilmstripMotionRefs {
  edgeOffsetRef: MutableRefObject<number>;
  edgeVelocityRef: MutableRefObject<number>;
  inertiaFrameRef: MutableRefObject<number | null>;
  reboundFrameRef: MutableRefObject<number | null>;
  suppressClickRef: MutableRefObject<boolean>;
  velocityRef: MutableRefObject<number>;
}

interface FilmstripPointerMoveOptions {
  dragState: FilmstripDragState;
  clientX: number;
  now: number;
  pointerType: string;
  syncEdgeOffset: (nextOffset: number) => void;
  viewport: HTMLDivElement;
  motionRefs: FilmstripMotionRefs;
}

interface FinishFilmstripGestureOptions {
  dragState: FilmstripDragState;
  onSelectFrame: (frameId: string) => void;
  prefersReducedMotion: boolean;
  syncEdgeOffset: (nextOffset: number) => void;
  viewport: HTMLDivElement;
  motionRefs: FilmstripMotionRefs;
}

/**
 * Scrollbar metrics depend on live DOM measurements, so the observer effect reads them from the
 * element directly instead of trying to infer them from React props.
 */
export function getFilmstripScrollState(
  element: HTMLDivElement,
): FilmstripScrollState {
  return {
    clientWidth: element.clientWidth,
    scrollLeft: element.scrollLeft,
    scrollWidth: element.scrollWidth,
  };
}

/**
 * Overscroll rebound runs outside React, so any pending animation frame must be cancelled
 * explicitly when a new gesture starts or the component unmounts.
 */
function cancelFilmstripRebound(
  reboundFrameRef: MutableRefObject<number | null>,
  edgeVelocityRef: MutableRefObject<number>,
) {
  if (reboundFrameRef.current !== null) {
    window.cancelAnimationFrame(reboundFrameRef.current);
    reboundFrameRef.current = null;
  }

  edgeVelocityRef.current = 0;
}

/**
 * Inertia uses requestAnimationFrame as well, which means React cannot clean it up automatically
 * when the pointer session ends.
 */
function cancelFilmstripInertia(
  inertiaFrameRef: MutableRefObject<number | null>,
  velocityRef: MutableRefObject<number>,
) {
  if (inertiaFrameRef.current !== null) {
    window.cancelAnimationFrame(inertiaFrameRef.current);
    inertiaFrameRef.current = null;
  }

  velocityRef.current = 0;
}

/**
 * Both inertia and rebound can outlive the render that started them, so the hook needs one shared
 * shutdown path before every new drag and during unmount.
 */
export function cancelFilmstripMotion(motionRefs: FilmstripMotionRefs) {
  cancelFilmstripInertia(motionRefs.inertiaFrameRef, motionRefs.velocityRef);
  cancelFilmstripRebound(
    motionRefs.reboundFrameRef,
    motionRefs.edgeVelocityRef,
  );
}

/**
 * Adds a short elastic rebound so overscrolling feels intentional instead of snapping back
 * abruptly at the edge.
 */
function startFilmstripRebound({
  initialOffset,
  motionRefs,
  prefersReducedMotion,
  syncEdgeOffset,
}: {
  initialOffset: number;
  motionRefs: FilmstripMotionRefs;
  prefersReducedMotion: boolean;
  syncEdgeOffset: (nextOffset: number) => void;
}) {
  cancelFilmstripRebound(
    motionRefs.reboundFrameRef,
    motionRefs.edgeVelocityRef,
  );

  if (prefersReducedMotion || Math.abs(initialOffset) < 0.5) {
    syncEdgeOffset(0);
    return;
  }

  syncEdgeOffset(initialOffset);
  motionRefs.edgeVelocityRef.current = -initialOffset * 0.16;

  const step = () => {
    const currentOffset = motionRefs.edgeOffsetRef.current;
    const nextVelocity =
      (motionRefs.edgeVelocityRef.current - currentOffset * 0.14) * 0.82;
    const nextOffset = currentOffset + nextVelocity;

    if (Math.abs(nextOffset) < 0.35 && Math.abs(nextVelocity) < 0.2) {
      syncEdgeOffset(0);
      motionRefs.reboundFrameRef.current = null;
      motionRefs.edgeVelocityRef.current = 0;
      return;
    }

    motionRefs.edgeVelocityRef.current = nextVelocity;
    syncEdgeOffset(nextOffset);
    motionRefs.reboundFrameRef.current = window.requestAnimationFrame(step);
  };

  motionRefs.reboundFrameRef.current = window.requestAnimationFrame(step);
}

/**
 * Mouse and touch drags intentionally share one physics model so the strip never feels like two
 * different components depending on which input device the operator used.
 */
export function applyFilmstripPointerMove({
  dragState,
  clientX,
  now,
  pointerType,
  syncEdgeOffset,
  viewport,
  motionRefs,
}: FilmstripPointerMoveOptions) {
  const dragGain =
    pointerType === "mouse"
      ? FILMSTRIP_MOUSE_DRAG_GAIN
      : FILMSTRIP_TOUCH_DRAG_GAIN;
  const travelX = (clientX - dragState.startX) * dragGain;
  const maxScrollLeft = Math.max(
    0,
    viewport.scrollWidth - viewport.clientWidth,
  );
  const nextScrollLeft = dragState.startScrollLeft - travelX;
  const deltaTime = Math.max(now - dragState.lastTimestamp, 1);
  const deltaScroll = dragState.lastClientX - clientX;

  // Ignore tiny movement so a light tap on a thumbnail does not get reclassified as a drag.
  if (!dragState.moved && Math.abs(travelX) > 4) {
    dragState.moved = true;
    motionRefs.suppressClickRef.current = true;
  }

  if (nextScrollLeft < 0 || nextScrollLeft > maxScrollLeft) {
    const overscroll =
      nextScrollLeft < 0 ? nextScrollLeft : nextScrollLeft - maxScrollLeft;
    const direction = overscroll < 0 ? 1 : -1;
    const overscrollMagnitude = Math.abs(overscroll);
    const visualOffset =
      direction *
      Math.min(
        FILMSTRIP_EDGE_OFFSET_LIMIT,
        Math.pow(overscrollMagnitude, 0.86) * FILMSTRIP_OVERSCROLL_GAIN,
      );
    syncEdgeOffset(visualOffset);
    viewport.scrollLeft = clampNumber(nextScrollLeft, 0, maxScrollLeft);
  } else {
    syncEdgeOffset(0);
    viewport.scrollLeft = nextScrollLeft;
  }

  motionRefs.velocityRef.current =
    (deltaScroll / deltaTime) * FILMSTRIP_INERTIA_VELOCITY_GAIN;
  dragState.lastClientX = clientX;
  dragState.lastTimestamp = now;
}

/**
 * Click suppression has to reset on the next macrotask so the release event from a drag does not
 * immediately trigger thumbnail selection on the same pointer sequence.
 */
function resetFilmstripClickSuppression(
  suppressClickRef: MutableRefObject<boolean>,
) {
  window.setTimeout(() => {
    suppressClickRef.current = false;
  }, 0);
}

/**
 * Continues strip momentum after release and converts edge collisions into the same rebound model
 * used during direct overscroll, keeping release behavior consistent with drag behavior.
 */
function startFilmstripInertia({
  motionRefs,
  syncEdgeOffset,
  viewport,
}: {
  motionRefs: FilmstripMotionRefs;
  syncEdgeOffset: (nextOffset: number) => void;
  viewport: HTMLDivElement;
}) {
  let lastFrameTime = performance.now();
  const maxScrollLeft = Math.max(
    0,
    viewport.scrollWidth - viewport.clientWidth,
  );

  const step = (timestamp: number) => {
    const deltaTime = Math.min(28, timestamp - lastFrameTime || 16);
    lastFrameTime = timestamp;
    const nextScrollLeft =
      viewport.scrollLeft + motionRefs.velocityRef.current * deltaTime;

    if (nextScrollLeft <= 0 || nextScrollLeft >= maxScrollLeft) {
      viewport.scrollLeft = clampNumber(nextScrollLeft, 0, maxScrollLeft);
      startFilmstripRebound({
        initialOffset: clampNumber(
          Math.sign(motionRefs.velocityRef.current) *
            -1 *
            Math.max(
              18,
              Math.min(
                FILMSTRIP_EDGE_OFFSET_LIMIT,
                Math.abs(motionRefs.velocityRef.current) * 14,
              ),
            ),
          -FILMSTRIP_EDGE_OFFSET_LIMIT,
          FILMSTRIP_EDGE_OFFSET_LIMIT,
        ),
        motionRefs,
        prefersReducedMotion: false,
        syncEdgeOffset,
      });
      motionRefs.velocityRef.current = 0;
      motionRefs.inertiaFrameRef.current = null;
      return;
    }

    viewport.scrollLeft = nextScrollLeft;
    motionRefs.velocityRef.current *= Math.pow(0.996, deltaTime);

    if (
      Math.abs(motionRefs.velocityRef.current) < FILMSTRIP_INERTIA_MIN_VELOCITY
    ) {
      motionRefs.velocityRef.current = 0;
      motionRefs.inertiaFrameRef.current = null;
      return;
    }

    motionRefs.inertiaFrameRef.current = window.requestAnimationFrame(step);
  };

  motionRefs.inertiaFrameRef.current = window.requestAnimationFrame(step);
}

/**
 * A release either means "select the tapped frame" or "finish the drag physics"; centralizing the
 * branch keeps the hook body from mixing input classification with animation code.
 */
export function finishFilmstripGesture({
  dragState,
  onSelectFrame,
  prefersReducedMotion,
  syncEdgeOffset,
  viewport,
  motionRefs,
}: FinishFilmstripGestureOptions) {
  const releaseEdgeOffset = motionRefs.edgeOffsetRef.current;

  if (dragState.moved) {
    if (Math.abs(releaseEdgeOffset) > 0.5) {
      startFilmstripRebound({
        initialOffset: releaseEdgeOffset * 1.12,
        motionRefs,
        prefersReducedMotion,
        syncEdgeOffset,
      });
    }

    if (!prefersReducedMotion) {
      startFilmstripInertia({
        motionRefs,
        syncEdgeOffset,
        viewport,
      });
    } else if (Math.abs(releaseEdgeOffset) > 0.5) {
      startFilmstripRebound({
        initialOffset: releaseEdgeOffset,
        motionRefs,
        prefersReducedMotion,
        syncEdgeOffset,
      });
    }

    resetFilmstripClickSuppression(motionRefs.suppressClickRef);
    return;
  }

  motionRefs.suppressClickRef.current = false;
  if (dragState.originFrameId) {
    onSelectFrame(dragState.originFrameId);
  }
}
