"use client";

import { Box } from "@mui/material";
import type { ViewerMediaRect } from "@magic-compare/compare-core";
import type { ViewerAsset } from "@magic-compare/compare-core/viewer-data";
import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { clampNumber } from "@magic-compare/shared-utils";
import { PositionedStageMedia } from "./positioned-stage-media";

/**
 * Keeps swipe compare aligned with the visible split direction, including the rotated mobile stage
 * where the divider becomes top/bottom instead of left/right.
 */
export function SwipeCompareStage({
  beforeAsset,
  afterAsset,
  mediaRect,
  rotateStage,
  setSwipePosition,
  swipePosition,
}: {
  beforeAsset: ViewerAsset;
  afterAsset: ViewerAsset;
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

  const clampedSwipePosition = clampNumber(swipePosition, 0, 100);
  const swipeAxisLength = rotateStage ? mediaRect.height : mediaRect.width;
  const swipeCssVariables = {
    "--swipe-position": `${clampedSwipePosition}%`,
    "--swipe-ratio": `${clampedSwipePosition / 100}`,
    "--swipe-offset": `${(swipeAxisLength * clampedSwipePosition) / 100}px`,
  } as CSSProperties;

  /**
   * Swipe drag feedback is DOM-adjacent transient state; writing CSS variables through one helper
   * keeps pointermove out of React while still letting reset/frame changes resync from props.
   */
  const writeSwipeCssVariables = useCallback(
    (nextPosition: number) => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      const clampedPosition = clampNumber(nextPosition, 0, 100);
      const ratio = clampedPosition / 100;
      const offset = (swipeAxisLength * clampedPosition) / 100;
      viewport.style.setProperty("--swipe-position", `${clampedPosition}%`);
      viewport.style.setProperty("--swipe-ratio", `${ratio}`);
      viewport.style.setProperty("--swipe-offset", `${offset}px`);
    },
    [swipeAxisLength],
  );

  /**
   * Batches drag-time CSS writes to the next animation frame so dense pointer streams do not force
   * a React render or multiple style writes inside one frame.
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
    transientSwipePositionRef.current = clampedSwipePosition;
    pendingSwipePositionRef.current = clampedSwipePosition;

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    writeSwipeCssVariables(clampedSwipePosition);
  }, [clampedSwipePosition, writeSwipeCssVariables]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  /**
   * Uses the rotated axis when portrait auto-rotation is active so the handle follows the divider
   * users actually see on screen instead of preserving the old horizontal math.
   */
  function resolveSwipePosition(clientX: number, clientY: number) {
    const viewport = viewportRef.current;
    if (!viewport) {
      return null;
    }

    const rect = viewport.getBoundingClientRect();

    if (rotateStage) {
      if (mediaRect.height <= 0) {
        return null;
      }

      // Rotated portrait mode presents the compare split vertically stacked, so swipe must follow Y.
      const localY = clientY - rect.top - mediaRect.y;
      return clampNumber((localY / mediaRect.height) * 100, 0, 100);
    }

    if (mediaRect.width <= 0) {
      return null;
    }

    const localX = clientX - rect.left - mediaRect.x;
    return clampNumber((localX / mediaRect.width) * 100, 0, 100);
  }

  /**
   * Updates the transient swipe value and either writes immediately for pointer down/up or queues a
   * frame-batched CSS update for high-frequency pointermove events.
   */
  function updateTransientSwipePosition({
    clientX,
    clientY,
    immediate,
  }: {
    clientX: number;
    clientY: number;
    immediate: boolean;
  }) {
    const nextPosition = resolveSwipePosition(clientX, clientY);
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

  /**
   * Captures the pointer so the divider continues tracking a drag even when the finger leaves the
   * visual handle.
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

  /**
   * Ignores unrelated pointers so multitouch or stray hover events cannot move the active divider.
   */
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
   * Releases capture on end/cancel so later gestures can start cleanly without inheriting a stale
   * active pointer id.
   */
  function finishPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activePointerIdRef.current = null;

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    writeSwipeCssVariables(transientSwipePositionRef.current);
    setSwipePosition(transientSwipePositionRef.current);
  }

  return (
    <Box
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      onDragStart={(event) => event.preventDefault()}
      style={swipeCssVariables}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        touchAction: "none",
        cursor: rotateStage ? "ns-resize" : "ew-resize",
        userSelect: "none",
      }}
    >
      <PositionedStageMedia
        asset={beforeAsset}
        alt={`${beforeAsset.label} preview`}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />
      <PositionedStageMedia
        asset={afterAsset}
        alt={`${afterAsset.label} preview`}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
        loading="eager"
        decoding="async"
        fetchPriority="high"
        clipPath={
          rotateStage
            ? "inset(0 0 calc(100% - var(--swipe-position)) 0)"
            : "inset(0 calc(100% - var(--swipe-position)) 0 0)"
        }
      />
      <Box
        sx={{
          position: "absolute",
          top: `${mediaRect.y}px`,
          height: rotateStage ? 2 : `${mediaRect.height}px`,
          left: `${mediaRect.x}px`,
          width: rotateStage ? `${mediaRect.width}px` : 2,
          transform: rotateStage
            ? "translateY(var(--swipe-offset)) translateY(-1px)"
            : "translateX(var(--swipe-offset)) translateX(-1px)",
          backgroundColor: "rgba(248, 245, 255, 0.88)",
          boxShadow:
            "0 0 14px rgba(228, 194, 242, 0.24), 0 0 36px rgba(242, 235, 201, 0.12)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          left: rotateStage
            ? `${mediaRect.x + mediaRect.width / 2}px`
            : `${mediaRect.x}px`,
          top: rotateStage
            ? `${mediaRect.y}px`
            : `${mediaRect.y + mediaRect.height / 2}px`,
          transform: rotateStage
            ? "translate(-50%, -50%) translateY(var(--swipe-offset))"
            : "translate(-50%, -50%) translateX(var(--swipe-offset))",
          width: 42,
          height: 42,
          borderRadius: "999px",
          border: "1px solid rgba(248, 245, 255, 0.22)",
          backgroundColor: "rgba(22, 37, 76, 0.34)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          boxShadow:
            "0 10px 24px rgba(10, 18, 42, 0.18), 0 0 18px rgba(228, 194, 242, 0.18)",
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
          "&::before, &::after": {
            content: '""',
            position: "absolute",
            width: 8,
            height: 8,
            borderTop: "2px solid rgba(248, 245, 255, 0.72)",
            borderRight: "2px solid rgba(248, 245, 255, 0.72)",
            filter: "drop-shadow(0 0 5px rgba(10, 18, 42, 0.2))",
          },
          "&::before": {
            ...(rotateStage
              ? {
                  top: 12,
                  left: "50%",
                  transform: "translateX(-50%) rotate(-45deg)",
                }
              : {
                  top: "50%",
                  left: 10,
                  transform: "translateY(-50%) rotate(-135deg)",
                }),
          },
          "&::after": {
            ...(rotateStage
              ? {
                  bottom: 12,
                  left: "50%",
                  transform: "translateX(-50%) rotate(135deg)",
                }
              : {
                  top: "50%",
                  right: 10,
                  transform: "translateY(-50%) rotate(45deg)",
                }),
          },
        }}
      />
    </Box>
  );
}
