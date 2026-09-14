import { describe, expect, it } from "vitest";
import { isCurrentStageImage } from "./use-stage-image-load-state";

function image(src = "https://example.com/b.png", currentSrc = src) {
  return { src, currentSrc, baseURI: "https://example.com/g/sample" } as HTMLImageElement;
}

describe("stage image request identity", () => {
  it("rejects detached nodes even when a URL is revisited", () => {
    const old = image();
    const current = image();
    expect(isCurrentStageImage(old, current, "/b.png", true)).toBe(false);
    expect(isCurrentStageImage(current, current, "/b.png", true)).toBe(true);
    expect(isCurrentStageImage(old, null, "/b.png")).toBe(false);
  });
  it("rejects old pixels while the node points at a new URL", () => {
    const current = image("https://example.com/b.png", "https://example.com/a.png");
    expect(isCurrentStageImage(current, current, "/b.png", true)).toBe(false);
    expect(isCurrentStageImage(current, current, "/a.png", true)).toBe(false);
  });
  it("accepts the current request error even when no pixels decoded", () => {
    const broken = image("https://example.com/b.png", "");
    expect(isCurrentStageImage(broken, broken, "/b.png")).toBe(true);
    expect(isCurrentStageImage(broken, broken, "/b.png", true)).toBe(false);
  });
});
