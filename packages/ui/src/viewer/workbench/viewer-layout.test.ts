import { describe, expect, it } from "vitest";
import {
  getViewerStageShellHeight,
  getViewerStageViewportHeight,
} from "./viewer-layout";

describe("getViewerStageViewportHeight", () => {
  it("reserves a one-screen stage budget on desktop", () => {
    expect(getViewerStageViewportHeight({ width: 1600, height: 900 })).toBe(
      864,
    );
  });

  it("uses the tighter mobile safe padding on short portrait viewports", () => {
    expect(getViewerStageViewportHeight({ width: 390, height: 844 })).toBe(
      820,
    );
  });
});

describe("getViewerStageShellHeight", () => {
  it("caps the shell at the actual fitted mobile portrait stage height", () => {
    expect(
      getViewerStageShellHeight({
        viewportSize: { width: 390, height: 844 },
        availableWidth: 358,
        aspectRatio: 16 / 9,
      }),
    ).toBeCloseTo(196.875, 10);
  });

  it("falls back to the minimum shell height before layout width has been measured", () => {
    expect(
      getViewerStageShellHeight({
        viewportSize: { width: 390, height: 844 },
        availableWidth: 0,
        aspectRatio: 16 / 9,
      }),
    ).toBe(140);
  });
});
