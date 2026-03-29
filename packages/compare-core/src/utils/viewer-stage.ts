export type ViewerPresetScale = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ViewerStageSize {
  width: number;
  height: number;
}

export interface ViewerMediaRect extends ViewerStageSize {
  x: number;
  y: number;
}

export interface ViewerPanZoomState {
  presetScale: ViewerPresetScale;
  fineScale: number;
  x: number;
  y: number;
}

export interface FilmstripScrollbarMetrics {
  visible: boolean;
  thumbWidth: number;
  thumbOffset: number;
}

export interface ViewerPhysicalScaleOptions {
  devicePixelRatio: number;
  media: ViewerStageSize;
  mediaRect: ViewerStageSize;
  rotateStage?: boolean;
}

export const VIEWER_MAX_FINE_SCALE = 5 / 3;
export const VIEWER_MIN_PRESET_SCALE: ViewerPresetScale = 1;
export const VIEWER_MAX_PRESET_SCALE: ViewerPresetScale = 8;

function normalizeClampedPanOffset(value: number): number {
  return Object.is(value, -0) ? 0 : value;
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
  effectiveScale: number,
  clampViewport: ViewerStageSize = mediaRect,
): ViewerPanZoomState {
  const presetScale = Math.min(
    VIEWER_MAX_PRESET_SCALE,
    Math.max(VIEWER_MIN_PRESET_SCALE, state.presetScale),
  ) as ViewerPresetScale;
  const fineScale = Math.min(VIEWER_MAX_FINE_SCALE, Math.max(1, state.fineScale));
  const scale = Math.max(0.01, effectiveScale);

  if (mediaRect.width <= 0 || mediaRect.height <= 0 || scale <= 1) {
    return {
      presetScale,
      fineScale,
      x: 0,
      y: 0,
    };
  }

  const maxX = Math.max(0, (mediaRect.width * scale - clampViewport.width) / 2);
  const maxY = Math.max(0, (mediaRect.height * scale - clampViewport.height) / 2);
  // clampViewport defaults to mediaRect for legacy contained-media behavior, but A/B inspect can
  // opt into the full stage viewport so zoomed content is constrained by the visible stage rather
  // than the smaller pre-zoom fit box.

  return {
    presetScale,
    fineScale,
    x: normalizeClampedPanOffset(Math.min(maxX, Math.max(-maxX, state.x))),
    y: normalizeClampedPanOffset(Math.min(maxY, Math.max(-maxY, state.y))),
  };
}

export function getViewerPresetTransformScale(
  presetScale: ViewerPresetScale,
  options: ViewerPhysicalScaleOptions,
): number {
  const normalizedDpr = Math.max(1, options.devicePixelRatio || 1);
  const renderedWidth = options.rotateStage ? options.mediaRect.height : options.mediaRect.width;
  const renderedHeight = options.rotateStage ? options.mediaRect.width : options.mediaRect.height;

  if (
    options.media.width <= 0 ||
    options.media.height <= 0 ||
    renderedWidth <= 0 ||
    renderedHeight <= 0
  ) {
    return 1;
  }

  const cssPixelsPerSourcePixel = Math.min(
    renderedWidth / options.media.width,
    renderedHeight / options.media.height,
  );
  const physicalPixelsPerSourcePixel = cssPixelsPerSourcePixel * normalizedDpr;

  if (physicalPixelsPerSourcePixel <= 0) {
    return 1;
  }

  return presetScale / physicalPixelsPerSourcePixel;
}

export function getViewerEffectiveScale(
  state: ViewerPanZoomState,
  options: ViewerPhysicalScaleOptions,
): number {
  return getViewerPresetTransformScale(state.presetScale, options) * state.fineScale;
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
