import { describe, expect, it } from "vitest";
import { ViewerInteractionStore } from "./viewer-interaction-store";

function createScheduledStore(frameId = "frame-a") {
  let nextHandle = 1;
  const callbacks = new Map<number, () => void>();
  const store = new ViewerInteractionStore(frameId, {
    schedule(callback) {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      callbacks.delete(handle);
    },
  });

  return {
    callbacks,
    flush() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback());
    },
    store,
  };
}

describe("ViewerInteractionStore", () => {
  it("coalesces repeated pan updates into one frame notification", () => {
    const { callbacks, flush, store } = createScheduledStore();
    let notifications = 0;
    store.subscribe(() => notifications++);

    store.setPanZoomState("frame-a", { presetScale: 2, fineScale: 1, x: 10, y: 0 });
    store.setPanZoomState("frame-a", { presetScale: 2, fineScale: 1, x: 20, y: 5 });

    expect(callbacks.size).toBe(1);
    expect(notifications).toBe(0);
    expect(store.getAbSnapshot("frame-a").panZoomState.x).toBe(20);

    flush();
    expect(notifications).toBe(1);
  });

  it("returns default frame transforms immediately while preserving sampling preference", () => {
    const { store } = createScheduledStore();
    store.togglePixelRendering("frame-a");
    store.setPanZoomState("frame-a", { presetScale: 3, fineScale: 1, x: 40, y: -20 });

    const nextFrameBeforeActivation = store.getAbSnapshot("frame-b");
    expect(nextFrameBeforeActivation.panZoomState.presetScale).toBe(1);
    expect(nextFrameBeforeActivation.stageActive).toBe(false);
    expect(nextFrameBeforeActivation.pixelRenderingEnabled).toBe(true);

    store.activateFrame("frame-b");
    expect(store.getAbSnapshot("frame-b")).toMatchObject({
      displayedScale: 1,
      pixelRenderingEnabled: true,
      stageActive: false,
    });
    expect(store.getSwipePosition("frame-b")).toBe(50);
  });

  it("automatically enables nearest-neighbor sampling at 250 percent without changing pan", () => {
    const { store } = createScheduledStore();
    store.hydratePixelRenderingPreference();
    store.setPanZoomState("frame-a", { presetScale: 2, fineScale: 1.25, x: 32, y: -12 });

    const snapshot = store.getAbSnapshot("frame-a");
    expect(snapshot.displayedScale).toBe(2.5);
    expect(snapshot.pixelRenderingEnabled).toBe(true);
    expect(snapshot.panZoomState).toMatchObject({ x: 32, y: -12 });

    store.togglePixelRendering("frame-a");
    expect(store.getPixelRenderingAutoDisablePromptOpen()).toBe(true);
  });
});
