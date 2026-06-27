"use client";

import { useEffect, useRef, useState } from "react";
import {
  isViewerStageImageLoaded,
  markViewerStageImageLoaded,
} from "./stage-image-load-cache";

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
      markViewerStageImageLoaded(imageUrl);
      setLoadState({ imageUrl, status: "loaded" });
    }
  }, [imageUrl]);

  function markLoaded() {
    markViewerStageImageLoaded(imageUrl);
    setLoadState({ imageUrl, status: "loaded" });
  }

  function markErrored() {
    setLoadState({ imageUrl, status: "error" });
  }

  const currentImageErrored =
    loadState.imageUrl === imageUrl && loadState.status === "error";
  const showImage =
    !currentImageErrored &&
    (isViewerStageImageLoaded(imageUrl) ||
      (loadState.imageUrl === imageUrl && loadState.status === "loaded"));

  return {
    imageRef,
    markErrored,
    markLoaded,
    showImage,
  };
}
