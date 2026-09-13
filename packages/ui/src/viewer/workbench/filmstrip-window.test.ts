import { describe, expect, it } from "vitest";
import {
  FILMSTRIP_CARD_WIDTH,
  FILMSTRIP_ITEM_STRIDE,
  getFilmstripRenderWindow,
  shouldUpdateFilmstripRenderState,
} from "./filmstrip-window";

describe("filmstrip render window", () => {
  it("keeps a 183-frame desktop strip below 25 mounted image cards", () => {
    const window = getFilmstripRenderWindow({
      clientWidth: 1440,
      frameCount: 183,
      scrollLeft: 80 * FILMSTRIP_ITEM_STRIDE,
    });

    expect(window.end - window.start).toBeLessThanOrEqual(25);
    expect(window.start).toBeGreaterThan(0);
    expect(window.trailingSpacerWidth).toBeGreaterThan(0);
  });

  it("follows a manually scrolled viewport instead of pinning the initial cards", () => {
    const window = getFilmstripRenderWindow({
      clientWidth: 930,
      frameCount: 183,
      scrollLeft: 80 * FILMSTRIP_ITEM_STRIDE,
    });

    expect(window.start).toBeLessThanOrEqual(80);
    expect(window.end).toBeGreaterThan(80);
    expect(window.start).toBeGreaterThan(0);
  });

  it("preserves the full fixed-width strip through virtual spacers", () => {
    const frameCount = 183;
    const window = getFilmstripRenderWindow({
      clientWidth: 930,
      frameCount,
      scrollLeft: 80 * FILMSTRIP_ITEM_STRIDE,
    });
    const mountedCount = window.end - window.start;
    const internalGaps = Math.max(0, mountedCount - 1) * 8;
    const boundaryGaps = Number(window.start > 0) * 8 + Number(window.end < frameCount) * 8;
    const totalWidth =
      window.leadingSpacerWidth +
      window.trailingSpacerWidth +
      mountedCount * FILMSTRIP_CARD_WIDTH +
      internalGaps +
      boundaryGaps;

    expect(totalWidth).toBe(frameCount * FILMSTRIP_ITEM_STRIDE - 8);
  });

  it("skips React updates until scrolling crosses a virtual window boundary", () => {
    const current = { clientWidth: 930, scrollLeft: 0, scrollWidth: 28_540 };

    expect(shouldUpdateFilmstripRenderState(current, { ...current, scrollLeft: 40 }, 183)).toBe(
      false,
    );
    expect(
      shouldUpdateFilmstripRenderState(
        current,
        { ...current, scrollLeft: 12 * FILMSTRIP_ITEM_STRIDE },
        183,
      ),
    ).toBe(true);
  });
});
