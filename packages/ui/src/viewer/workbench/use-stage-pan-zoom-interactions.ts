"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import type { ViewerPanZoomState } from "@magic-compare/compare-core";
import {
  applyWheelZoom,
  beginPointerPan,
  finishPointerPan,
  finishTouchPinch,
  movePointerPan,
  moveTouchPinch,
  startTouchPinch,
  type StagePanGesture,
  type StageTouchGesture,
  type WheelLikeEvent,
} from "./stage-pan-zoom-gestures";

/**
 * Keeps pointer, wheel, and pinch bookkeeping out of the exported pan/zoom hook so the public hook
 * can stay focused on scale math and clamping.
 */
export function useStagePanZoomInteractions({
  active,
  applyPanZoom,
  effectiveScale,
  panZoomState,
  presetTransformScale,
}: {
  active: boolean;
  applyPanZoom: (nextState: ViewerPanZoomState) => void;
  effectiveScale: number;
  panZoomState: ViewerPanZoomState;
  presetTransformScale: number;
}) {
  const panGestureRef = useRef<StagePanGesture | null>(null);
  const touchGestureRef = useRef<StageTouchGesture | null>(null);
  const panZoomStateRef = useRef(panZoomState);
  const suppressStageClickRef = useRef(false);
  const clearSuppressedClickTimerRef = useRef<number | null>(null);

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
    return () => {
      if (clearSuppressedClickTimerRef.current !== null) {
        window.clearTimeout(clearSuppressedClickTimerRef.current);
      }
    };
  }, []);

  /**
   * Mouse dragging only starts once the image is actually zoomed in; otherwise dragging would fight
   * with the tap-to-switch-side behavior.
   */
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    beginPointerPan({
      active,
      effectiveScale,
      event,
      panGestureRef,
      panZoomStateRef,
    });
  }

  /**
   * Uses screen-space deltas so portrait auto-rotate still follows the user's finger direction.
   */
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    movePointerPan({
      applyPanZoom,
      event,
      panGestureRef,
      suppressStageClickRef,
    });
  }

  /**
   * Clears pointer capture and suppresses the next click after a real drag so panning does not also
   * toggle the A/B side.
   */
  function finishPointerInteraction(event: ReactPointerEvent<HTMLDivElement>) {
    finishPointerPan({
      clearSuppressedClickTimerRef,
      event,
      panGestureRef,
      suppressStageClickRef,
    });
  }

  /**
   * Trackpad zoom uses wheel events on desktop, but the handler itself must stay stable so the
   * stage can attach one non-passive DOM listener instead of resubscribing on every render.
   */
  const handleWheel = useCallback(
    (event: WheelLikeEvent) => {
      applyWheelZoom({
        applyPanZoom,
        event,
        panZoomStateRef,
      });
    },
    [applyPanZoom],
  );

  /**
   * Captures the starting distance and center point for a two-finger pinch gesture.
   */
  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    startTouchPinch({
      active,
      effectiveScale,
      event,
      panZoomStateRef,
      suppressStageClickRef,
      touchGestureRef,
    });
  }

  /**
   * Keeps pinch zoom anchored under the user's fingers by updating both scale and translation from
   * the gesture center.
   */
  function handleTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    moveTouchPinch({
      active,
      applyPanZoom,
      event,
      presetTransformScale,
      touchGestureRef,
    });
  }

  /**
   * Clears or rebases the active pinch gesture when fingers leave the screen so the next gesture
   * starts from the current scale instead of jumping back to stale touch coordinates.
   */
  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    finishTouchPinch({
      clearSuppressedClickTimerRef,
      effectiveScale,
      event,
      panZoomStateRef,
      suppressStageClickRef,
      touchGestureRef,
    });
  }

  return {
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
    },
  };
}
