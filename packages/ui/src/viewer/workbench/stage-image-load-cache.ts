const MAX_LOADED_STAGE_IMAGE_URLS = 128;
const loadedStageImageUrls = new Set<string>();

export function isViewerStageImageLoaded(url: string | undefined | null): boolean {
  return Boolean(url && loadedStageImageUrls.has(url));
}

/** Records a successfully loaded image URL so stage remounts and A/B side switches can skip fallback. */
export function markViewerStageImageLoaded(url: string | undefined | null): void {
  if (!url) {
    return;
  }

  if (loadedStageImageUrls.has(url)) {
    loadedStageImageUrls.delete(url);
  }

  loadedStageImageUrls.add(url);

  while (loadedStageImageUrls.size > MAX_LOADED_STAGE_IMAGE_URLS) {
    const oldestUrl = loadedStageImageUrls.keys().next().value as
      | string
      | undefined;
    if (!oldestUrl) {
      return;
    }

    loadedStageImageUrls.delete(oldestUrl);
  }
}

/** Keeps tests isolated from module-level image state without exposing mutation to app code paths. */
export function clearViewerStageImageLoadCacheForTest(): void {
  loadedStageImageUrls.clear();
}

/** Exposes cache size only for eviction regression tests; app code should treat the cache as opaque. */
export function getViewerStageImageLoadCacheSizeForTest(): number {
  return loadedStageImageUrls.size;
}
