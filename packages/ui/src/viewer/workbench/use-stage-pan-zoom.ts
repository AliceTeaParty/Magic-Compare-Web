"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  clampViewerPanZoom,
  getViewerEffectiveScale,
  getViewerPresetTransformScale,
  VIEWER_MAX_FINE_SCALE,
  type ViewerMediaRect,
  type ViewerPanZoomState,
} from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import { clampNumber } from "@magic-compare/shared-utils";

interface PointerSample {
  x: number;
  y: number;
}

interface WheelLikeEvent {
  cancelable: boolean;
  ctrlKey: boolean;
  deltaY: number;
  preventDefault: () => void;
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
 * Manages A/B stage pan and pinch behavior so rotated portrait mode and desktop mode share the
 * same gesture rules.
 */
export function useStagePanZoom({
  active,
  activeAsset,
  devicePixelRatio,
  mediaRect,
  panZoomState,
  rotateStage,
  setPanZoomState,
}: {
  active: boolean;
  activeAsset: ViewerAsset;
  devicePixelRatio: number;
  mediaRect: ViewerMediaRect;
  panZoomState: ViewerPanZoomState;
  rotateStage: boolean;
  setPanZoomState: (nextState: ViewerPanZoomState) => void;
}) {
  const panGestureRef = useRef<{
    baseState: ViewerPanZoomState;
    moved: boolean;
    pointerId: number;
    start: PointerSample;
  } | null>(null);
  const touchGestureRef = useRef<{
    baseEffectiveScale: number;
    baseState: ViewerPanZoomState;
    center: PointerSample;
    distance: number;
  } | null>(null);
  const panZoomStateRef = useRef(panZoomState);
  const suppressStageClickRef = useRef(false);
  const clearSuppressedClickTimerRef = useRef<number | null>(null);

  const scaleOptions = useMemo(
    () => ({
      devicePixelRatio,
      media: {
        width: activeAsset.width,
        height: activeAsset.height,
      },
      mediaRect,
      rotateStage,
    }),
    [activeAsset.height, activeAsset.width, devicePixelRatio, mediaRect, rotateStage],
  );
  const presetTransformScale = useMemo(
    () => getViewerPresetTransformScale(panZoomState.presetScale, scaleOptions),
    [panZoomState.presetScale, scaleOptions],
  );
  const effectiveScale = useMemo(
    () => getViewerEffectiveScale(panZoomState, scaleOptions),
    [panZoomState, scaleOptions],
  );

  // Gesture handlers outlive a single render, so they read the latest pan/zoom state from refs
  // instead of closing over stale React values mid-interaction.
  useEffect(() => {
    panZoomStateRef.current = panZoomState;
  }, [panZoomState]);

  useEffect(() => {
    if (active) {
      return;
    }

    panGestureRef.current = null;
    touchGestureRef.current = null;
    suppressStageClickRef.current = false;
  }, [active]);

  useEffect(() => {
    setPanZoomState(
      clampViewerPanZoom(
        panZoomStateRef.current,
        mediaRect,
        getViewerEffectiveScale(panZoomStateRef.current, scaleOptions),
      ),
    );
  }, [mediaRect, scaleOptions, setPanZoomState]);

  useEffect(() => {
    return () => {
      if (clearSuppressedClickTimerRef.current !== null) {
        window.clearTimeout(clearSuppressedClickTimerRef.current);
      }
    };
  }, []);

  /**
   * Reapplies the shared clamp rules so every gesture path respects the same pan bounds.
   */
  const applyPanZoom = useCallback((nextState: ViewerPanZoomState) => {
    setPanZoomState(
      clampViewerPanZoom(nextState, mediaRect, getViewerEffectiveScale(nextState, scaleOptions)),
    );
  }, [mediaRect, scaleOptions, setPanZoomState]);

  /**
   * Mouse dragging only starts once the image is actually zoomed in; otherwise dragging would fight
   * with the tap-to-switch-side behavior.
   */
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
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
   * Uses screen-space deltas so portrait auto-rotate still follows the user's finger direction.
   */
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
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
   * Clears pointer capture and suppresses the next click after a real drag so panning does not also
   * toggle the A/B side.
   */
  function finishPointerInteraction(event: ReactPointerEvent<HTMLDivElement>) {
    const panGesture = panGestureRef.current;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!panGesture || panGesture.pointerId !== event.pointerId) {
      return;
    }

    panGestureRef.current = null;

    if (panGesture.moved) {
      if (clearSuppressedClickTimerRef.current !== null) {
        window.clearTimeout(clearSuppressedClickTimerRef.current);
      }

      clearSuppressedClickTimerRef.current = window.setTimeout(() => {
        suppressStageClickRef.current = false;
      }, 0);
    }
  }

  /**
   * Trackpad zoom uses wheel events on desktop, but the handler itself must stay stable so the
   * stage can attach one non-passive DOM listener instead of resubscribing on every render.
   */
  const handleWheel = useCallback((event: WheelLikeEvent) => {
    if (!event.ctrlKey) {
      return;
    }

    if (!active) {
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
  }, [active, applyPanZoom]);

  /**
   * Captures the starting distance and center point for a two-finger pinch gesture.
   */
  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    if (!active || event.touches.length !== 2) {
      touchGestureRef.current = null;
      return;
    }

    event.preventDefault();
    const firstSample = getTouchSample(event.touches[0]);
    const secondSample = getTouchSample(event.touches[1]);
    const center = {
      x: (firstSample.x + secondSample.x) / 2,
      y: (firstSample.y + secondSample.y) / 2,
    };

    suppressStageClickRef.current = true;
    touchGestureRef.current = {
      baseEffectiveScale: effectiveScale,
      baseState: panZoomStateRef.current,
      center,
      distance: getPointerDistance(firstSample, secondSample),
    };
  }

  /**
   * Keeps pinch zoom anchored under the user's fingers by updating both scale and translation from
   * the gesture center.
   */
  function handleTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
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
    const center = {
      x: (firstSample.x + secondSample.x) / 2,
      y: (firstSample.y + secondSample.y) / 2,
    };
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
   * Clears or rebases the active pinch gesture when fingers leave the screen so the next gesture
   * starts from the current scale instead of jumping back to stale touch coordinates.
   */
  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length >= 2) {
      const firstSample = getTouchSample(event.touches[0]);
      const secondSample = getTouchSample(event.touches[1]);
      touchGestureRef.current = {
        baseEffectiveScale: effectiveScale,
        baseState: panZoomStateRef.current,
        distance: getPointerDistance(firstSample, secondSample),
        center: {
          x: (firstSample.x + secondSample.x) / 2,
          y: (firstSample.y + secondSample.y) / 2,
        },
      };
      return;
    }

    touchGestureRef.current = null;
    if (clearSuppressedClickTimerRef.current !== null) {
      window.clearTimeout(clearSuppressedClickTimerRef.current);
    }
    clearSuppressedClickTimerRef.current = window.setTimeout(() => {
      suppressStageClickRef.current = false;
    }, 0);
  }

  return {
    effectiveScale,
    consumeStageClick() {
      return !suppressStageClickRef.current;
    },
    handleNonPassiveWheel: handleWheel,
    stageHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishPointerInteraction,
      onPointerCancel: finishPointerInteraction,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd,
      onWheel: handleWheel as (event: ReactWheelEvent<HTMLDivElement>) => void,
    },
  };
}
