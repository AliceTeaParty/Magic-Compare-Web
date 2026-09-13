import { describe, expect, it } from "vitest";
import { getViewerStageScrollPadding } from "./viewer-layout";

describe("getViewerStageScrollPadding", () => {
  it("uses a compact inset for narrow or short viewports", () => {
    expect(getViewerStageScrollPadding({ width: 390, height: 844 })).toBe(12);
    expect(getViewerStageScrollPadding({ width: 900, height: 700 })).toBe(12);
  });

  it("uses the desktop inset when both viewport dimensions have room", () => {
    expect(getViewerStageScrollPadding({ width: 1600, height: 900 })).toBe(18);
  });
});
