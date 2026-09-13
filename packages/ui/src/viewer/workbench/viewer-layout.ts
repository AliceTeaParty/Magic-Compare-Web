export interface ViewerLayoutViewportSize {
  width: number;
  height: number;
}

/**
 * Keeps stage sizing and scroll-target offsets aligned so the compare surface can occupy one full
 * screen after the page scrolls to it, while still allowing the initial load to start above it.
 */
export function getViewerStageScrollPadding(viewportSize: ViewerLayoutViewportSize): number {
  // Keep one shared inset for both sizing and scroll targeting so the stage lands in the same
  // place the layout math assumed; this avoids "fit" scroll landing a few pixels too low/high.
  return viewportSize.width < 760 || viewportSize.height < 760 ? 12 : 18;
}
