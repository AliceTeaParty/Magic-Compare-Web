import { clampNumber } from "@magic-compare/shared-utils";

export const FILMSTRIP_CARD_WIDTH = 148;
export const FILMSTRIP_GAP = 8;
export const FILMSTRIP_ITEM_STRIDE = FILMSTRIP_CARD_WIDTH + FILMSTRIP_GAP;
const FILMSTRIP_OVERSCAN_ITEMS = 4;
const FALLBACK_VISIBLE_ITEMS = 8;

export interface FilmstripRenderWindow {
  end: number;
  leadingSpacerWidth: number;
  start: number;
  trailingSpacerWidth: number;
}

/**
 * Converts fixed card geometry into one bounded render window while ensuring a newly selected frame
 * is mounted before the viewport scroll position is synchronized.
 */
export function getFilmstripRenderWindow({
  activeIndex,
  clientWidth,
  frameCount,
  scrollLeft,
}: {
  activeIndex: number;
  clientWidth: number;
  frameCount: number;
  scrollLeft: number;
}): FilmstripRenderWindow {
  if (frameCount <= 0) {
    return { end: 0, leadingSpacerWidth: 0, start: 0, trailingSpacerWidth: 0 };
  }

  const visibleItems =
    clientWidth > 0
      ? Math.max(1, Math.ceil(clientWidth / FILMSTRIP_ITEM_STRIDE))
      : FALLBACK_VISIBLE_ITEMS;
  const windowSize = Math.min(frameCount, visibleItems + FILMSTRIP_OVERSCAN_ITEMS * 2);
  const visibleStart = Math.floor(Math.max(0, scrollLeft) / FILMSTRIP_ITEM_STRIDE);
  let start = clampNumber(
    visibleStart - FILMSTRIP_OVERSCAN_ITEMS,
    0,
    Math.max(0, frameCount - windowSize),
  );
  let end = Math.min(frameCount, start + windowSize);

  if (activeIndex >= 0 && (activeIndex < start || activeIndex >= end)) {
    start = clampNumber(
      activeIndex - Math.floor(windowSize / 2),
      0,
      Math.max(0, frameCount - windowSize),
    );
    end = Math.min(frameCount, start + windowSize);
  }

  const remainingItems = frameCount - end;
  return {
    end,
    leadingSpacerWidth: start > 0 ? start * FILMSTRIP_ITEM_STRIDE - FILMSTRIP_GAP : 0,
    start,
    trailingSpacerWidth:
      remainingItems > 0 ? remainingItems * FILMSTRIP_ITEM_STRIDE - FILMSTRIP_GAP : 0,
  };
}
