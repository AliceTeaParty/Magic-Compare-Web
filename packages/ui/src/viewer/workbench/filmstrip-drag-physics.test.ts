import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelFilmstripGesture, type FilmstripMotionRefs } from "./filmstrip-drag-physics";

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
