export interface StageImageDecodeTarget {
  currentSrc: string;
  naturalWidth: number;
  decode?: () => Promise<void>;
}

/**
 * Waits until the loaded source is paintable and rejects a late result after the same DOM image
 * has moved to another frame, which would otherwise reveal or cache pixels under the wrong URL.
 */
export async function waitForStageImageDecode(image: StageImageDecodeTarget): Promise<boolean> {
  const loadedSource = image.currentSrc;
  if (!loadedSource || image.naturalWidth <= 0) {
    return false;
  }

  try {
    await image.decode?.();
  } catch {
    // Some browsers reject decode() for an image they can already paint. Natural width remains the
    // reliable fallback, while an actual network/format failure still arrives through onError.
  }

  return image.currentSrc === loadedSource && image.naturalWidth > 0;
}
