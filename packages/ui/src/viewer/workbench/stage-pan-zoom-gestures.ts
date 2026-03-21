"use client";

import type {
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import {
  VIEWER_MAX_FINE_SCALE,
  type ViewerPanZoomState,
} from "@magic-compare/compare-core";
import { clampNumber } from "@magic-compare/shared-utils";

export interface PointerSample {
  x: number;
  y: number;
}

export interface WheelLikeEvent {
  cancelable: boolean;
  ctrlKey: boolean;
  deltaY: number;
  preventDefault: () => void;
}

export interface StagePanGesture {
  baseState: ViewerPanZoomState;
  moved: boolean;
  pointerId: number;
  start: PointerSample;
}

export interface StageTouchGesture {
  baseEffectiveScale: number;
  baseState: ViewerPanZoomState;
  center: PointerSample;
  distance: number;
}

/**
 * Gesture distance must be measured in screen space because the stage may be rotated before the
 * image is painted.
 */
function getPointerDistance(first: PointerSample, second: PointerSample): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

/**
 * Normalizes DOM touch objects into the lightweight sample shape used by the gesture refs.
 */
function getTouchSample(touch: { clientX: number; clientY: number }): PointerSample {
  return {
    x: touch.clientX,
    y: touch.clientY,
  };
}

/**
 * Pinch math needs a shared center point helper so touch start, move, and rebase after finger
 * changes all stay aligned on the same screen-space anchor.
 */
function getGestureCenter(first: PointerSample, second: PointerSample): PointerSample {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

/**
 * Stage click suppression should clear on the next macrotask so a completed pan or pinch does not
 * immediately trigger the click handler from the same pointer sequence.
 */
function scheduleSuppressedStageClickReset(
  clearSuppressedClickTimerRef: MutableRefObject<number | null>,
  suppressStageClickRef: MutableRefObject<boolean>,
) {
  if (clearSuppressedClickTimerRef.current !== null) {
    window.clearTimeout(clearSuppressedClickTimerRef.current);
  }

  clearSuppressedClickTimerRef.current = window.setTimeout(() => {
    suppressStageClickRef.current = false;
  }, 0);
}

/**
 * Pointer panning only activates while the stage is meaningfully zoomed, otherwise the same drag
 * would conflict with tap gestures that switch the active A/B side.
 */
export function beginPointerPan({
  active,
  effectiveScale,
  event,
  panGestureRef,
  panZoomStateRef,
}: {
  active: boolean;
  effectiveScale: number;
  event: ReactPointerEvent<HTMLDivElement>;
  panGestureRef: MutableRefObject<StagePanGesture | null>;
  panZoomStateRef: MutableRefObject<ViewerPanZoomState>;
}) {
  if (event.pointerType !== "mouse" || event.button !== 0 || !active || effectiveScale <= 1) {
    return;
  }

  event.currentTarget.setPointerCapture(event.pointerId);
  panGestureRef.current = {
    pointerId: event.pointerId,
    start: { x: event.clientX, y: event.clientY },
    moved: false,
    baseState: panZoomStateRef.current,
  };
}

/**
 * Screen-space deltas preserve the user's perceived drag direction even when portrait mode rotates
 * the rendered media underneath the pointer.
 */
export function movePointerPan({
  applyPanZoom,
  event,
  panGestureRef,
  suppressStageClickRef,
}: {
  applyPanZoom: (nextState: ViewerPanZoomState) => void;
  event: ReactPointerEvent<HTMLDivElement>;
  panGestureRef: MutableRefObject<StagePanGesture | null>;
  suppressStageClickRef: MutableRefObject<boolean>;
}) {
  const panGesture = panGestureRef.current;
  if (!panGesture || panGesture.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - panGesture.start.x;
  const deltaY = event.clientY - panGesture.start.y;

  // Ignore tiny jitter so a tap does not turn into a drag.
  if (Math.abs(deltaX) + Math.abs(deltaY) > 6) {
    panGesture.moved = true;
    suppressStageClickRef.current = true;
  }

  applyPanZoom({
    presetScale: panGesture.baseState.presetScale,
    fineScale: panGesture.baseState.fineScale,
    x: panGesture.baseState.x + deltaX,
    y: panGesture.baseState.y + deltaY,
  });
}

/**
 * Drag release must explicitly clear pointer capture and defer click re-enable so panning never
 * falls through to the stage click handler on the same gesture.
 */
export function finishPointerPan({
  clearSuppressedClickTimerRef,
  event,
  panGestureRef,
  suppressStageClickRef,
}: {
  clearSuppressedClickTimerRef: MutableRefObject<number | null>;
  event: ReactPointerEvent<HTMLDivElement>;
  panGestureRef: MutableRefObject<StagePanGesture | null>;
  suppressStageClickRef: MutableRefObject<boolean>;
}) {
  const panGesture = panGestureRef.current;

  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (!panGesture || panGesture.pointerId !== event.pointerId) {
    return;
  }

  panGestureRef.current = null;

  if (panGesture.moved) {
    scheduleSuppressedStageClickReset(clearSuppressedClickTimerRef, suppressStageClickRef);
  }
}

/**
 * Wheel-based fine zoom uses the same clamped pan/zoom path as touch gestures so desktop trackpads
 * and mobile pinch interactions cannot diverge in scale bounds.
 */
export function applyWheelZoom({
  active,
  applyPanZoom,
  event,
  panZoomStateRef,
}: {
  active: boolean;
  applyPanZoom: (nextState: ViewerPanZoomState) => void;
  event: WheelLikeEvent;
  panZoomStateRef: MutableRefObject<ViewerPanZoomState>;
}) {
  if (!event.ctrlKey || !active) {
    return;
  }

  // React's delegated wheel listener may be passive in some environments, so preventDefault must
  // run only when the browser still allows cancellation. A native non-passive listener is added
  // by the stage component for the real scroll suppression path.
  if (event.cancelable) {
    event.preventDefault();
  }

  const nextFineScale = clampNumber(
    panZoomStateRef.current.fineScale * (event.deltaY < 0 ? 1.12 : 0.88),
    1,
    VIEWER_MAX_FINE_SCALE,
  );

  applyPanZoom({
    presetScale: panZoomStateRef.current.presetScale,
    fineScale: nextFineScale,
    x: panZoomStateRef.current.x,
    y: panZoomStateRef.current.y,
  });
}

/**
 * Capturing the initial pinch baseline separately avoids scale jumps when a gesture begins after
 * the user already zoomed or panned the stage with another input method.
 */
export function startTouchPinch({
  active,
  effectiveScale,
  event,
  panZoomStateRef,
  suppressStageClickRef,
  touchGestureRef,
}: {
  active: boolean;
  effectiveScale: number;
  event: ReactTouchEvent<HTMLDivElement>;
  panZoomStateRef: MutableRefObject<ViewerPanZoomState>;
  suppressStageClickRef: MutableRefObject<boolean>;
  touchGestureRef: MutableRefObject<StageTouchGesture | null>;
}) {
  if (!active || event.touches.length !== 2) {
    touchGestureRef.current = null;
    return;
  }

  event.preventDefault();
  const firstSample = getTouchSample(event.touches[0]);
  const secondSample = getTouchSample(event.touches[1]);

  suppressStageClickRef.current = true;
  touchGestureRef.current = {
    baseEffectiveScale: effectiveScale,
    baseState: panZoomStateRef.current,
    center: getGestureCenter(firstSample, secondSample),
    distance: getPointerDistance(firstSample, secondSample),
  };
}

/**
 * Pinch zoom keeps the center anchored in screen space because that matches where the user expects
 * the image to stay under their fingers after auto-rotation.
 */
export function moveTouchPinch({
  active,
  applyPanZoom,
  event,
  presetTransformScale,
  touchGestureRef,
}: {
  active: boolean;
  applyPanZoom: (nextState: ViewerPanZoomState) => void;
  event: ReactTouchEvent<HTMLDivElement>;
  presetTransformScale: number;
  touchGestureRef: MutableRefObject<StageTouchGesture | null>;
}) {
  if (!active || event.touches.length !== 2) {
    return;
  }

  const gesture = touchGestureRef.current;
  if (!gesture) {
    return;
  }

  event.preventDefault();
  const firstSample = getTouchSample(event.touches[0]);
  const secondSample = getTouchSample(event.touches[1]);
  const center = getGestureCenter(firstSample, secondSample);
  const nextEffectiveScale =
    gesture.baseEffectiveScale *
    (getPointerDistance(firstSample, secondSample) / Math.max(gesture.distance, 1));
  const nextFineScale = clampNumber(
    nextEffectiveScale / Math.max(presetTransformScale, 0.01),
    1,
    VIEWER_MAX_FINE_SCALE,
  );

  applyPanZoom({
    presetScale: gesture.baseState.presetScale,
    fineScale: nextFineScale,
    x: gesture.baseState.x + (center.x - gesture.center.x),
    y: gesture.baseState.y + (center.y - gesture.center.y),
  });
}

/**
 * When fingers leave the glass one by one, rebasing from the current state avoids the next pinch
 * jumping back to stale geometry captured at the previous touch start.
 */
export function finishTouchPinch({
  clearSuppressedClickTimerRef,
  effectiveScale,
  event,
  panZoomStateRef,
  suppressStageClickRef,
  touchGestureRef,
}: {
  clearSuppressedClickTimerRef: MutableRefObject<number | null>;
  effectiveScale: number;
  event: ReactTouchEvent<HTMLDivElement>;
  panZoomStateRef: MutableRefObject<ViewerPanZoomState>;
  suppressStageClickRef: MutableRefObject<boolean>;
  touchGestureRef: MutableRefObject<StageTouchGesture | null>;
}) {
  if (event.touches.length >= 2) {
    const firstSample = getTouchSample(event.touches[0]);
    const secondSample = getTouchSample(event.touches[1]);
    touchGestureRef.current = {
      baseEffectiveScale: effectiveScale,
      baseState: panZoomStateRef.current,
      distance: getPointerDistance(firstSample, secondSample),
      center: getGestureCenter(firstSample, secondSample),
    };
    return;
  }

  touchGestureRef.current = null;
  scheduleSuppressedStageClickReset(clearSuppressedClickTimerRef, suppressStageClickRef);
}
