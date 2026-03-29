import { getFittedStageSize } from "@magic-compare/compare-core";

export interface ViewerLayoutViewportSize {
  width: number;
  height: number;
}

/**
 * Keeps stage sizing and scroll-target offsets aligned so the compare surface can occupy one full
 * screen after the page scrolls to it, while still allowing the initial load to start above it.
 */
export function getViewerStageScrollPadding(
  viewportSize: ViewerLayoutViewportSize,
): number {
  // Keep one shared inset for both sizing and scroll targeting so the stage lands in the same
  // place the layout math assumed; this avoids "fit" scroll landing a few pixels too low/high.
  return viewportSize.width < 760 || viewportSize.height < 760 ? 12 : 18;
}

/**
 * Converts the current browser viewport into the target stage height budget used by the workbench
 * when the compare surface is scrolled into view.
 */
export function getViewerStageViewportHeight(
  viewportSize: ViewerLayoutViewportSize,
): number {
  // This budget belongs only to the stage. The header stays in normal document flow above it, so
  // the first screen may cut the stage off while a later scroll position still fits it cleanly.
  return Math.max(
    viewportSize.height - getViewerStageScrollPadding(viewportSize) * 2,
    140,
  );
}

/**
 * Resolves the rendered stage shell height from the available inline size plus the one-screen
 * budget. The budget stays an upper bound only; otherwise narrow mobile layouts would center a
 * much smaller fitted stage inside an overly tall shell and create the blank space from P1.
 */
export function getViewerStageShellHeight(options: {
  viewportSize: ViewerLayoutViewportSize;
  availableWidth: number;
  aspectRatio: number;
}): number {
  const stageViewportHeight = getViewerStageViewportHeight(options.viewportSize);

  if (options.availableWidth <= 0 || options.aspectRatio <= 0) {
    return 140;
  }

  const fittedStageSize = getFittedStageSize(
    {
      width: options.availableWidth,
      height: stageViewportHeight,
    },
    options.aspectRatio,
  );

  return fittedStageSize?.height ?? 140;
}
