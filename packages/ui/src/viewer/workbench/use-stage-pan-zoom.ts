"use client";

import {
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

function getPointerDistance(first: PointerSample, second: PointerSample): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function getTouchSample(touch: { clientX: number; clientY: number }): PointerSample {
  return {
    x: touch.clientX,
    y: touch.clientY,
  };
}

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

  function applyPanZoom(nextState: ViewerPanZoomState) {
    setPanZoomState(
      clampViewerPanZoom(nextState, mediaRect, getViewerEffectiveScale(nextState, scaleOptions)),
    );
  }

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

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const panGesture = panGestureRef.current;

    if (!panGesture || panGesture.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - panGesture.start.x;
    const deltaY = event.clientY - panGesture.start.y;

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

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();
    if (!active) {
      return;
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
    stageHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishPointerInteraction,
      onPointerCancel: finishPointerInteraction,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd,
      onWheel: handleWheel,
    },
  };
}
