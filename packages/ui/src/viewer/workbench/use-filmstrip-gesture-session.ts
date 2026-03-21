"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  applyFilmstripPointerMove,
  cancelFilmstripMotion,
  finishFilmstripGesture,
  type FilmstripDragState,
  type FilmstripMotionRefs,
} from "./filmstrip-drag-physics";

/**
 * Keeps drag bookkeeping and inertial release physics out of the exported workbench hook so the
 * public hook stays focused on composition instead of pointer state machines.
 */
export function useFilmstripGestureSession({
  frameCount,
  onSelectFrame,
  prefersReducedMotion,
}: {
  frameCount: number;
  onSelectFrame: (frameId: string) => void;
  prefersReducedMotion: boolean;
}) {
  const [edgeOffset, setEdgeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<FilmstripDragState | null>(null);
  const inertiaFrameRef = useRef<number | null>(null);
  const reboundFrameRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  const edgeOffsetRef = useRef(0);
  const edgeVelocityRef = useRef(0);
  const suppressClickRef = useRef(false);
  const motionRefsRef = useRef<FilmstripMotionRefs>({
    edgeOffsetRef,
    edgeVelocityRef,
    inertiaFrameRef,
    reboundFrameRef,
    suppressClickRef,
    velocityRef,
  });
  const motionRefs = motionRefsRef.current;

  // Animation frames must be cancelled manually because inertia can outlive the component tree that
  // started it.
  useEffect(() => {
    return () => {
      cancelFilmstripMotion(motionRefs);
    };
  }, [motionRefs]);

  /**
   * Edge offset has to update the ref and state together because rebound physics read the ref
   * outside React while the component still needs the rendered offset for visuals.
   */
  function syncEdgeOffset(nextOffset: number) {
    edgeOffsetRef.current = nextOffset;
    setEdgeOffset(nextOffset);
  }

  /**
   * Records the gesture origin so click-to-select and drag-to-scroll can share one surface.
   */
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (frameCount <= 1) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    cancelFilmstripMotion(motionRefs);
    setIsDragging(true);
    dragStateRef.current = {
      lastClientX: event.clientX,
      lastTimestamp: performance.now(),
      moved: false,
      originFrameId:
        event.target instanceof Element
          ? (event.target.closest<HTMLElement>("[data-frame-id]")?.dataset
              .frameId ?? null)
          : null,
      pointerId: event.pointerId,
      startScrollLeft: event.currentTarget.scrollLeft,
      startX: event.clientX,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  /**
   * Applies overscroll resistance and velocity tracking so mouse and touch drags both land on the
   * same inertial behavior.
   */
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    applyFilmstripPointerMove({
      dragState,
      clientX: event.clientX,
      now: performance.now(),
      pointerType: event.pointerType,
      syncEdgeOffset,
      viewport: event.currentTarget,
      motionRefs,
    });
  }

  /**
   * Resolves the gesture as either a drag release with inertia or a plain click release that
   * should select the frame under the pointer.
   */
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
    finishFilmstripGesture({
      dragState,
      onSelectFrame,
      prefersReducedMotion,
      syncEdgeOffset,
      viewport: event.currentTarget,
      motionRefs,
    });
  }

  /**
   * Ignores clicks that were produced by a drag gesture so scrolling the strip does not also
   * switch frames accidentally.
   */
  function handleFrameSelection(frameId: string) {
    if (suppressClickRef.current) {
      return;
    }

    onSelectFrame(frameId);
  }

  /**
   * Native drag previews interfere with the custom pointer physics, so thumbnail dragging is
   * explicitly disabled and the strip stays under one gesture system.
   */
  function handleNativeDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  return {
    edgeOffset,
    isDragging,
    handleFrameSelection,
    viewportHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishPointerDrag,
      onPointerCancel: finishPointerDrag,
      onDragStart: handleNativeDragStart,
    },
  };
}
