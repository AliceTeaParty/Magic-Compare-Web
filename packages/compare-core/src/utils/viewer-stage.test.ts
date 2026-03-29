import { describe, expect, it } from "vitest";
import {
  clampViewerPanZoom,
  cycleAbSide,
  getContainedMediaRect,
  getViewerEffectiveScale,
  getFilmstripScrollbarMetrics,
  getFittedStageSize,
  VIEWER_MAX_PRESET_SCALE,
  getViewerPresetTransformScale,
  VIEWER_MAX_FINE_SCALE,
} from "./viewer-stage";

describe("getFittedStageSize", () => {
  it("fits a 16:9 stage inside the viewport padding budget", () => {
    expect(getFittedStageSize({ width: 1440, height: 900 }, 16 / 9)).toEqual({
      width: 1420,
      height: 798.75,
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
    expect(
      clampViewerPanZoom(
        {
          presetScale: 2,
          fineScale: VIEWER_MAX_FINE_SCALE,
          x: 600,
          y: -420,
        },
        { width: 320, height: 180 },
        3,
      ),
    ).toEqual({
      presetScale: 2,
      fineScale: VIEWER_MAX_FINE_SCALE,
      x: 320,
      y: -180,
    });
  });

  it("resets pan when the effective scale is at or below 1x", () => {
    expect(
      clampViewerPanZoom(
        {
          presetScale: 1,
          fineScale: 1.2,
          x: 60,
          y: -30,
        },
        { width: 320, height: 180 },
        0.84,
      ),
    ).toEqual({
      presetScale: 1,
      fineScale: 1.2,
      x: 0,
      y: 0,
    });
  });

  it("clamps panning to the stage viewport when it is larger than the base media rect", () => {
    expect(
      clampViewerPanZoom(
        {
          presetScale: 2,
          fineScale: VIEWER_MAX_FINE_SCALE,
          x: 240,
          y: -180,
        },
        { width: 320, height: 180 },
        3,
        { width: 960, height: 540 },
      ),
    ).toEqual({
      presetScale: 2,
      fineScale: VIEWER_MAX_FINE_SCALE,
      x: 0,
      y: 0,
    });
  });
});

describe("physical scale helpers", () => {
  it("derives a pixel-exact preset transform from media size, viewport size and DPR", () => {
    expect(
      getViewerPresetTransformScale(1, {
        devicePixelRatio: 2,
        media: { width: 1920, height: 1080 },
        mediaRect: { width: 960, height: 540 },
      }),
    ).toBeCloseTo(1, 10);

    expect(
      getViewerPresetTransformScale(2, {
        devicePixelRatio: 2,
        media: { width: 1920, height: 1080 },
        mediaRect: { width: 960, height: 540 },
      }),
    ).toBeCloseTo(2, 10);

    expect(
      getViewerPresetTransformScale(4, {
        devicePixelRatio: 2,
        media: { width: 1920, height: 1080 },
        mediaRect: { width: 960, height: 540 },
      }),
    ).toBeCloseTo(4, 10);

    expect(
      getViewerPresetTransformScale(VIEWER_MAX_PRESET_SCALE, {
        devicePixelRatio: 2,
        media: { width: 1920, height: 1080 },
        mediaRect: { width: 960, height: 540 },
      }),
    ).toBeCloseTo(8, 10);
  });

  it("accounts for rotated stages when resolving pixel-exact transforms", () => {
    expect(
      getViewerPresetTransformScale(1, {
        devicePixelRatio: 3,
        media: { width: 1600, height: 900 },
        mediaRect: { width: 180, height: 320 },
        rotateStage: true,
      }),
    ).toBeCloseTo(1.6666666667, 8);
  });

  it("combines preset and fine scale into the final transform scale", () => {
    expect(
      getViewerEffectiveScale(
        {
          presetScale: VIEWER_MAX_PRESET_SCALE,
          fineScale: 1.25,
          x: 0,
          y: 0,
        },
        {
          devicePixelRatio: 2,
          media: { width: 1920, height: 1080 },
          mediaRect: { width: 960, height: 540 },
        },
      ),
    ).toBeCloseTo(10, 10);
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
