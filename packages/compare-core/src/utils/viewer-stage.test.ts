import { describe, expect, it } from "vitest";
import {
  clampViewerPanZoom,
  cycleAbSide,
  getContainedMediaRect,
  getFilmstripScrollbarMetrics,
  getFittedStageSize,
} from "./viewer-stage";

describe("getFittedStageSize", () => {
  it("fits a 16:9 stage inside the viewport padding budget", () => {
    expect(getFittedStageSize({ width: 1440, height: 900 }, 16 / 9)).toEqual({
      width: 1408,
      height: 792,
    });
  });
});

describe("getContainedMediaRect", () => {
  it("keeps letterboxed media aligned inside the stage shell", () => {
    const rect = getContainedMediaRect({ width: 800, height: 450 }, { width: 1920, height: 800 });

    expect(rect.x).toBe(0);
    expect(rect.width).toBe(800);
    expect(rect.y).toBeCloseTo(58.33333333333334, 10);
    expect(rect.height).toBeCloseTo(333.3333333333333, 10);
  });
});

describe("clampViewerPanZoom", () => {
  it("clamps panning to the zoomed media bounds", () => {
    expect(clampViewerPanZoom({ scale: 3, x: 600, y: -420 }, { width: 320, height: 180 })).toEqual(
      {
        scale: 3,
        x: 320,
        y: -180,
      },
    );
  });
});

describe("getFilmstripScrollbarMetrics", () => {
  it("derives a stable thumb width and offset from scroll state", () => {
    expect(getFilmstripScrollbarMetrics(420, 1260, 210)).toEqual({
      visible: true,
      thumbWidth: 140,
      thumbOffset: 70,
    });
  });
});

describe("cycleAbSide", () => {
  it("toggles between before and after", () => {
    expect(cycleAbSide("before")).toBe("after");
    expect(cycleAbSide("after")).toBe("before");
  });
});
