import { describe, expect, it, vi } from "vitest";
import {
  clearViewerStageImageLoadCacheForTest,
  getViewerStageImageLoadCacheSizeForTest,
  isViewerStageImageLoaded,
  markViewerStageImageLoaded,
} from "./stage-image-load-cache";
import {
  ViewerImagePreloadQueue,
  type ViewerPreloadImageHandle,
} from "./viewer-image-preloader-core";

function createControllableQueue(limit: () => number) {
  const handles: ViewerPreloadImageHandle[] = [];
  const queue = new ViewerImagePreloadQueue({
    connectionLimit: limit,
    createImage: () => {
      const handle: ViewerPreloadImageHandle = {
        src: "",
        onload: null,
        onerror: null,
      };
      handles.push(handle);
      return handle;
    },
    maxCacheEntries: 4,
  });

  return { handles, queue };
}

describe("ViewerImagePreloadQueue", () => {
  it("deduplicates queued and loading image URLs", () => {
    const { handles, queue } = createControllableQueue(() => 1);

    queue.enqueue("/a.png", 10);
    queue.enqueue("/a.png", 100);

    expect(handles).toHaveLength(1);
    expect(queue.activeRequestCount).toBe(1);
    expect(queue.queuedRequestCount).toBe(0);
  });

  it("runs the highest-priority queued image first when capacity opens", () => {
    let limit = 0;
    const { handles, queue } = createControllableQueue(() => limit);

    queue.enqueue("/low.png", 10);
    queue.enqueue("/high.png", 90);
    expect(queue.queuedRequestCount).toBe(2);

    limit = 1;
    queue.enqueue("/trigger.png", 1);

    expect(handles[0]?.src).toBe("/high.png");
    expect(queue.activeRequestCount).toBe(1);
    expect(queue.queuedRequestCount).toBe(2);
  });

  it("raises priority when a queued URL receives stronger intent", () => {
    let limit = 0;
    const { handles, queue } = createControllableQueue(() => limit);

    queue.enqueue("/candidate.png", 10);
    queue.enqueue("/other.png", 20);
    queue.enqueue("/candidate.png", 100);

    limit = 1;
    queue.enqueue("/trigger.png", 1);

    expect(handles[0]?.src).toBe("/candidate.png");
  });

  it("respects the active request limit and continues after load", () => {
    const { handles, queue } = createControllableQueue(() => 2);

    queue.enqueue("/a.png", 30);
    queue.enqueue("/b.png", 20);
    queue.enqueue("/c.png", 10);

    expect(handles.map((handle) => handle.src)).toEqual(["/a.png", "/b.png"]);
    expect(queue.activeRequestCount).toBe(2);
    expect(queue.queuedRequestCount).toBe(1);

    handles[0]?.onload?.();

    expect(handles.map((handle) => handle.src)).toEqual([
      "/a.png",
      "/b.png",
      "/c.png",
    ]);
    expect(queue.activeRequestCount).toBe(2);
    expect(queue.queuedRequestCount).toBe(0);
  });

  it("allows retry after an image error", () => {
    const { handles, queue } = createControllableQueue(() => 1);

    queue.enqueue("/a.png", 10);
    handles[0]?.onerror?.();
    queue.enqueue("/a.png", 10);

    expect(handles.map((handle) => handle.src)).toEqual(["/a.png", "/a.png"]);
  });

  it("notifies successful loads so rendered stage images can skip fallback", () => {
    const onLoad = vi.fn();
    const handles: ViewerPreloadImageHandle[] = [];
    const queue = new ViewerImagePreloadQueue({
      connectionLimit: () => 1,
      createImage: () => {
        const handle: ViewerPreloadImageHandle = {
          src: "",
          onload: null,
          onerror: null,
        };
        handles.push(handle);
        return handle;
      },
      onLoad,
    });

    queue.enqueue("/loaded.png", 10);
    handles[0]?.onload?.();

    expect(onLoad).toHaveBeenCalledWith("/loaded.png");
  });
});

describe("stage image load cache", () => {
  it("keeps the most recent loaded image URLs bounded", () => {
    clearViewerStageImageLoadCacheForTest();

    for (let index = 0; index < 140; index += 1) {
      markViewerStageImageLoaded(`/frame-${index}.png`);
    }

    expect(getViewerStageImageLoadCacheSizeForTest()).toBe(128);
    expect(isViewerStageImageLoaded("/frame-0.png")).toBe(false);
    expect(isViewerStageImageLoaded("/frame-139.png")).toBe(true);
  });
});
