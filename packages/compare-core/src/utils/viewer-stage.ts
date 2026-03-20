export interface ViewerStageSize {
  width: number;
  height: number;
}

export interface ViewerMediaRect extends ViewerStageSize {
  x: number;
  y: number;
}

export interface ViewerPanZoomState {
  scale: number;
  x: number;
  y: number;
}

export interface FilmstripScrollbarMetrics {
  visible: boolean;
  thumbWidth: number;
  thumbOffset: number;
}

export function getFittedStageSize(
  viewport: ViewerStageSize,
  aspectRatio: number,
): ViewerStageSize | null {
  if (viewport.width <= 0 || viewport.height <= 0 || aspectRatio <= 0) {
    return null;
  }

  const horizontalPadding = viewport.width < 760 ? 8 : 16;
  const verticalPadding = viewport.height < 760 ? 10 : 18;
  const maxWidth = Math.max(viewport.width - horizontalPadding * 2, 220);
  const maxHeight = Math.max(viewport.height - verticalPadding * 2, 140);

  let width = Math.min(maxWidth, maxHeight * aspectRatio);
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  return {
    width,
    height,
  };
}

export function getContainedMediaRect(
  container: ViewerStageSize,
  media: ViewerStageSize,
): ViewerMediaRect {
  if (container.width <= 0 || container.height <= 0 || media.width <= 0 || media.height <= 0) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }

  const scale = Math.min(container.width / media.width, container.height / media.height);
  const width = media.width * scale;
  const height = media.height * scale;

  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  };
}

export function clampViewerPanZoom(
  state: ViewerPanZoomState,
  mediaRect: ViewerStageSize,
): ViewerPanZoomState {
  const scale = Math.min(5, Math.max(1, state.scale));

  if (mediaRect.width <= 0 || mediaRect.height <= 0 || scale === 1) {
    return {
      scale,
      x: 0,
      y: 0,
    };
  }

  const maxX = Math.max(0, (mediaRect.width * scale - mediaRect.width) / 2);
  const maxY = Math.max(0, (mediaRect.height * scale - mediaRect.height) / 2);

  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, state.x)),
    y: Math.min(maxY, Math.max(-maxY, state.y)),
  };
}

export function getFilmstripScrollbarMetrics(
  clientWidth: number,
  scrollWidth: number,
  scrollLeft: number,
): FilmstripScrollbarMetrics {
  if (clientWidth <= 0 || scrollWidth <= clientWidth) {
    return {
      visible: false,
      thumbWidth: clientWidth,
      thumbOffset: 0,
    };
  }

  const ratio = clientWidth / scrollWidth;
  const thumbWidth = Math.max(44, clientWidth * ratio);
  const maxThumbOffset = Math.max(0, clientWidth - thumbWidth);
  const maxScrollLeft = Math.max(1, scrollWidth - clientWidth);
  const thumbOffset = (scrollLeft / maxScrollLeft) * maxThumbOffset;

  return {
    visible: true,
    thumbWidth,
    thumbOffset,
  };
}

export function cycleAbSide(currentSide: "before" | "after"): "before" | "after" {
  return currentSide === "before" ? "after" : "before";
}
