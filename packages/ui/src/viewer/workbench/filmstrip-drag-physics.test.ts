import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelFilmstripGesture,
  finishFilmstripGesture,
  type FilmstripMotionRefs,
} from "./filmstrip-drag-physics";

function ref<T>(current: T) {
  return { current };
}

afterEach(() => vi.useRealTimers());

describe("filmstrip drag cancellation", () => {
  it("clears motion and edge state without entering the frame-selection release path", () => {
    vi.useFakeTimers();
    const syncEdgeOffset = vi.fn();
    const motionRefs: FilmstripMotionRefs = {
      edgeOffsetRef: ref(18),
      edgeVelocityRef: ref(0.7),
      inertiaFrameRef: ref<number | null>(null),
      reboundFrameRef: ref<number | null>(null),
      suppressClickRef: ref(true),
      velocityRef: ref(1.2),
    };

    cancelFilmstripGesture({ syncEdgeOffset, motionRefs });

    expect(motionRefs.velocityRef.current).toBe(0);
    expect(motionRefs.edgeVelocityRef.current).toBe(0);
    expect(motionRefs.suppressClickRef.current).toBe(true);
    expect(syncEdgeOffset).toHaveBeenCalledOnce();
    expect(syncEdgeOffset).toHaveBeenCalledWith(0);

    vi.runAllTimers();
    expect(motionRefs.suppressClickRef.current).toBe(false);
  });
});

describe("filmstrip tap release", () => {
  it("selects once and suppresses the native click from the captured pointer sequence", () => {
    vi.useFakeTimers();
    const onSelectFrame = vi.fn();
    const motionRefs: FilmstripMotionRefs = {
      edgeOffsetRef: ref(0),
      edgeVelocityRef: ref(0),
      inertiaFrameRef: ref<number | null>(null),
      reboundFrameRef: ref<number | null>(null),
      suppressClickRef: ref(false),
      velocityRef: ref(0),
    };

    finishFilmstripGesture({
      dragState: {
        lastClientX: 20,
        lastTimestamp: 0,
        moved: false,
        originFrameId: "frame-2",
        pointerId: 1,
        startScrollLeft: 0,
        startX: 20,
      },
      motionRefs,
      onSelectFrame,
      prefersReducedMotion: false,
      syncEdgeOffset: vi.fn(),
      viewport: {} as HTMLDivElement,
    });

    expect(onSelectFrame).toHaveBeenCalledOnce();
    expect(onSelectFrame).toHaveBeenCalledWith("frame-2");
    expect(motionRefs.suppressClickRef.current).toBe(true);

    vi.runAllTimers();
    expect(motionRefs.suppressClickRef.current).toBe(false);
  });
});
