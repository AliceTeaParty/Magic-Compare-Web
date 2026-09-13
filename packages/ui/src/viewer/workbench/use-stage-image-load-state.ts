"use client";

import { type SyntheticEvent, useCallback, useEffect, useRef, useState } from "react";
import { isViewerStageImageLoaded, markViewerStageImageLoaded } from "./stage-image-load-cache";
import { waitForStageImageDecode } from "./stage-image-decode";

/**
 * Bridges browser image load events, preloader hits, and React rendering into one visible state.
 */
export function useStageImageLoadState(imageUrl: string) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loadState, setLoadState] = useState<{
    imageUrl: string | null;
    status: "loaded" | "error";
  }>(() =>
    isViewerStageImageLoaded(imageUrl)
      ? {
          imageUrl,
          status: "loaded",
        }
      : {
          imageUrl: null,
          status: "error",
        },
  );

  /** Keeps the truthful loading surface visible until pixels can be painted, not just downloaded. */
  const revealDecodedImage = useCallback((image: HTMLImageElement, expectedImageUrl: string) => {
    void waitForStageImageDecode(image).then((decoded) => {
      if (!decoded || imageRef.current !== image) {
        return;
      }

      markViewerStageImageLoaded(expectedImageUrl);
      setLoadState({ imageUrl: expectedImageUrl, status: "loaded" });
    });
  }, []);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) {
      return;
    }

    if (isViewerStageImageLoaded(imageUrl)) {
      setLoadState({ imageUrl, status: "loaded" });
      return;
    }

    if (image.complete && image.naturalWidth > 0) {
      revealDecodedImage(image, imageUrl);
    }
  }, [imageUrl, revealDecodedImage]);

  function markLoaded(event: SyntheticEvent<HTMLImageElement>) {
    revealDecodedImage(event.currentTarget, imageUrl);
  }

  function markErrored() {
    setLoadState({ imageUrl, status: "error" });
  }

  const currentImageErrored = loadState.imageUrl === imageUrl && loadState.status === "error";
  const showImage =
    !currentImageErrored &&
    (isViewerStageImageLoaded(imageUrl) ||
      (loadState.imageUrl === imageUrl && loadState.status === "loaded"));

  return {
    hasError: currentImageErrored,
    imageRef,
    markErrored,
    markLoaded,
    showImage,
  };
}
