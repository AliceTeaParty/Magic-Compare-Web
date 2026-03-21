"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { getFilmstripScrollbarMetrics } from "@magic-compare/compare-core";
import { clampNumber } from "@magic-compare/shared-utils";

const FILMSTRIP_EDGE_OFFSET_LIMIT = 36;
const FILMSTRIP_INERTIA_MIN_VELOCITY = 0.018;
const FILMSTRIP_INERTIA_VELOCITY_GAIN = 1.28;
const FILMSTRIP_MOUSE_DRAG_GAIN = 1.58;
const FILMSTRIP_TOUCH_DRAG_GAIN = 1.18;
const FILMSTRIP_OVERSCROLL_GAIN = 0.36;

interface FilmstripScrollState {
  clientWidth: number;
  scrollLeft: number;
  scrollWidth: number;
}

export function useFilmstripDrag({
  frameCount,
  onSelectFrame,
  prefersReducedMotion,
}: {
  frameCount: number;
  onSelectFrame: (frameId: string) => void;
  prefersReducedMotion: boolean;
}) {
  const [filmstripScrollState, setFilmstripScrollState] = useState<FilmstripScrollState>({
    clientWidth: 0,
    scrollLeft: 0,
    scrollWidth: 0,
  });
  const [edgeOffset, setEdgeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    lastClientX: number;
    lastTimestamp: number;
    moved: boolean;
    originFrameId: string | null;
    pointerId: number;
    startScrollLeft: number;
    startX: number;
  } | null>(null);
  const inertiaFrameRef = useRef<number | null>(null);
  const reboundFrameRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  const edgeOffsetRef = useRef(0);
  const edgeVelocityRef = useRef(0);
  const suppressClickRef = useRef(false);

  const scrollbarMetrics = useMemo(
    () =>
      getFilmstripScrollbarMetrics(
        filmstripScrollState.clientWidth,
        filmstripScrollState.scrollWidth,
        filmstripScrollState.scrollLeft,
      ),
    [filmstripScrollState],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    function syncScrollState() {
      const element = viewportRef.current;
      if (!element) {
        return;
      }

      setFilmstripScrollState({
        clientWidth: element.clientWidth,
        scrollLeft: element.scrollLeft,
        scrollWidth: element.scrollWidth,
      });
    }

    syncScrollState();
    viewport.addEventListener("scroll", syncScrollState, { passive: true });
    const observer = new ResizeObserver(syncScrollState);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", syncScrollState);
      observer.disconnect();
    };
  }, [frameCount]);

  useEffect(() => {
    return () => {
      cancelMotion();
    };
  }, []);

  function syncEdgeOffset(nextOffset: number) {
    edgeOffsetRef.current = nextOffset;
    setEdgeOffset(nextOffset);
  }

  function cancelRebound() {
    if (reboundFrameRef.current !== null) {
      window.cancelAnimationFrame(reboundFrameRef.current);
      reboundFrameRef.current = null;
    }

    edgeVelocityRef.current = 0;
  }

  function cancelInertia() {
    if (inertiaFrameRef.current !== null) {
      window.cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }

    velocityRef.current = 0;
  }

  function cancelMotion() {
    cancelInertia();
    cancelRebound();
  }

  function startRebound(initialOffset: number) {
    cancelRebound();

    if (prefersReducedMotion || Math.abs(initialOffset) < 0.5) {
      syncEdgeOffset(0);
      return;
    }

    syncEdgeOffset(initialOffset);
    edgeVelocityRef.current = -initialOffset * 0.16;

    const step = () => {
      const currentOffset = edgeOffsetRef.current;
      const nextVelocity = (edgeVelocityRef.current - currentOffset * 0.14) * 0.82;
      const nextOffset = currentOffset + nextVelocity;

      if (Math.abs(nextOffset) < 0.35 && Math.abs(nextVelocity) < 0.2) {
        syncEdgeOffset(0);
        reboundFrameRef.current = null;
        edgeVelocityRef.current = 0;
        return;
      }

      edgeVelocityRef.current = nextVelocity;
      syncEdgeOffset(nextOffset);
      reboundFrameRef.current = window.requestAnimationFrame(step);
    };

    reboundFrameRef.current = window.requestAnimationFrame(step);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (frameCount <= 1) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    cancelMotion();
    setIsDragging(true);
    dragStateRef.current = {
      lastClientX: event.clientX,
      lastTimestamp: performance.now(),
      moved: false,
      originFrameId:
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-frame-id]")?.dataset.frameId ?? null
          : null,
      pointerId: event.pointerId,
      startScrollLeft: event.currentTarget.scrollLeft,
      startX: event.clientX,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const dragGain =
      event.pointerType === "mouse" ? FILMSTRIP_MOUSE_DRAG_GAIN : FILMSTRIP_TOUCH_DRAG_GAIN;
    const travelX = (event.clientX - dragState.startX) * dragGain;
    const viewport = event.currentTarget;
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const nextScrollLeft = dragState.startScrollLeft - travelX;
    const now = performance.now();
    const deltaTime = Math.max(now - dragState.lastTimestamp, 1);
    const deltaScroll = dragState.lastClientX - event.clientX;

    if (!dragState.moved && Math.abs(travelX) > 4) {
      dragState.moved = true;
      suppressClickRef.current = true;
    }

    if (nextScrollLeft < 0 || nextScrollLeft > maxScrollLeft) {
      const overscroll = nextScrollLeft < 0 ? nextScrollLeft : nextScrollLeft - maxScrollLeft;
      const direction = overscroll < 0 ? 1 : -1;
      const overscrollMagnitude = Math.abs(overscroll);
      const visualOffset = direction * Math.min(
        FILMSTRIP_EDGE_OFFSET_LIMIT,
        Math.pow(overscrollMagnitude, 0.86) * FILMSTRIP_OVERSCROLL_GAIN,
      );
      syncEdgeOffset(visualOffset);
      viewport.scrollLeft = clampNumber(nextScrollLeft, 0, maxScrollLeft);
    } else {
      syncEdgeOffset(0);
      viewport.scrollLeft = nextScrollLeft;
    }

    velocityRef.current = (deltaScroll / deltaTime) * FILMSTRIP_INERTIA_VELOCITY_GAIN;
    dragState.lastClientX = event.clientX;
    dragState.lastTimestamp = now;
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setIsDragging(false);
    dragStateRef.current = null;
    const releaseEdgeOffset = edgeOffsetRef.current;

    if (dragState.moved) {
      if (Math.abs(releaseEdgeOffset) > 0.5) {
        startRebound(releaseEdgeOffset * 1.12);
      }

      if (!prefersReducedMotion) {
        const viewport = event.currentTarget;
        const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
        let lastFrameTime = performance.now();

        const step = (timestamp: number) => {
          const deltaTime = Math.min(28, timestamp - lastFrameTime || 16);
          lastFrameTime = timestamp;
          const nextScrollLeft = viewport.scrollLeft + velocityRef.current * deltaTime;

          if (nextScrollLeft <= 0 || nextScrollLeft >= maxScrollLeft) {
            viewport.scrollLeft = clampNumber(nextScrollLeft, 0, maxScrollLeft);
            startRebound(
              clampNumber(
                Math.sign(velocityRef.current) * -1 * Math.max(
                  18,
                  Math.min(FILMSTRIP_EDGE_OFFSET_LIMIT, Math.abs(velocityRef.current) * 14),
                ),
                -FILMSTRIP_EDGE_OFFSET_LIMIT,
                FILMSTRIP_EDGE_OFFSET_LIMIT,
              ),
            );
            velocityRef.current = 0;
            inertiaFrameRef.current = null;
            return;
          }

          viewport.scrollLeft = nextScrollLeft;
          velocityRef.current *= Math.pow(0.996, deltaTime);

          if (Math.abs(velocityRef.current) < FILMSTRIP_INERTIA_MIN_VELOCITY) {
            velocityRef.current = 0;
            inertiaFrameRef.current = null;
            return;
          }

          inertiaFrameRef.current = window.requestAnimationFrame(step);
        };

        inertiaFrameRef.current = window.requestAnimationFrame(step);
      } else if (Math.abs(releaseEdgeOffset) > 0.5) {
        startRebound(releaseEdgeOffset);
      }

      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      return;
    }

    suppressClickRef.current = false;
    if (dragState.originFrameId) {
      onSelectFrame(dragState.originFrameId);
    }
  }

  function handleFrameSelection(frameId: string) {
    if (suppressClickRef.current) {
      return;
    }

    onSelectFrame(frameId);
  }

  return {
    edgeOffset,
    isDragging,
    scrollbarMetrics,
    viewportRef,
    handleFrameSelection,
    viewportHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishPointerDrag,
      onPointerCancel: finishPointerDrag,
      onDragStart(event: ReactPointerEvent<HTMLDivElement>) {
        event.preventDefault();
      },
    },
  };
}
