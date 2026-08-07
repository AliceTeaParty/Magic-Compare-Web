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
 * Converts fixed card geometry into one bounded render window anchored to the real scroll position.
 * Keeping the active frame in this window pinned the first cards while users scrolled elsewhere,
 * leaving the visible portion as an empty virtual spacer until selection changed.
 */
export function getFilmstripRenderWindow({
  clientWidth,
  frameCount,
  scrollLeft,
}: {
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
  const start = clampNumber(
    visibleStart - FILMSTRIP_OVERSCAN_ITEMS,
    0,
    Math.max(0, frameCount - windowSize),
  );
  const end = Math.min(frameCount, start + windowSize);

  const remainingItems = frameCount - end;
  return {
    end,
    leadingSpacerWidth: start > 0 ? start * FILMSTRIP_ITEM_STRIDE - FILMSTRIP_GAP : 0,
    start,
    trailingSpacerWidth:
      remainingItems > 0 ? remainingItems * FILMSTRIP_ITEM_STRIDE - FILMSTRIP_GAP : 0,
  };
}
