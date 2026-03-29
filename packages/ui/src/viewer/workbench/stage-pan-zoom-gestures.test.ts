import { describe, expect, it } from "vitest";
import { applyWheelZoom } from "./stage-pan-zoom-gestures";

describe("applyWheelZoom", () => {
  it("applies ctrl-wheel zoom even before the A/B stage is click-activated", () => {
    let nextState = null as null | {
      presetScale: number;
      fineScale: number;
      x: number;
      y: number;
    };

    applyWheelZoom({
      applyPanZoom: (value) => {
        nextState = value;
      },
      event: {
        ctrlKey: true,
        deltaY: -120,
        cancelable: true,
        preventDefault() {},
      },
      panZoomStateRef: {
        current: {
          presetScale: 1,
          fineScale: 1,
          x: 0,
          y: 0,
        },
      },
    });

    expect(nextState).toEqual({
      presetScale: 1,
      fineScale: 1.12,
      x: 0,
      y: 0,
    });
  });

  it("continues scaling across the old whole-number boundary without needing the toolbar", () => {
    let nextState = null as null | {
      presetScale: number;
      fineScale: number;
      x: number;
      y: number;
    };

    applyWheelZoom({
      applyPanZoom: (value) => {
        nextState = value;
      },
      event: {
        ctrlKey: true,
        deltaY: -120,
        cancelable: true,
        preventDefault() {},
      },
      panZoomStateRef: {
        current: {
          presetScale: 1,
          fineScale: 1.6,
          x: 0,
          y: 0,
        },
      },
    });

    expect(nextState?.presetScale).toBe(2);
    expect(nextState?.fineScale).toBeCloseTo(0.896, 10);
    expect(nextState?.x).toBe(0);
    expect(nextState?.y).toBe(0);
  });
});
