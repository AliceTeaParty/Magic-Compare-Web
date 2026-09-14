"use client";

import { type SyntheticEvent, useCallback, useEffect, useRef, useState } from "react";
import { waitForStageImageDecode } from "./stage-image-decode";

/** Compare the DOM source as well as node identity; a URL can be revisited after another request. */
export function isCurrentStageImage(
  image: HTMLImageElement,
  current: HTMLImageElement | null,
  imageUrl: string,
  requireDecodedSource = false,
) {
  if (image !== current) return false;
  try {
    const expected = new URL(imageUrl, image.baseURI).href;
    return image.src === expected && (!requireDecodedSource || image.currentSrc === expected);
  } catch {
    return false;
  }
}

/** Each source owns a keyed image node; only that node's successful decode may reveal pixels. */
export function useStageImageLoadState(imageUrl: string) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [state, setState] = useState<{
    image: HTMLImageElement;
    imageUrl: string;
    status: "loaded" | "error";
  } | null>(null);

  /** Recheck after decode because navigation can detach the image while its promise is pending. */
  const revealDecodedImage = useCallback(async (image: HTMLImageElement, expectedUrl: string) => {
    if (!isCurrentStageImage(image, imageRef.current, expectedUrl, true)) return;
    const decoded = await waitForStageImageDecode(image);
    if (!decoded || !isCurrentStageImage(image, imageRef.current, expectedUrl, true)) return;
    setState({ image, imageUrl: expectedUrl, status: "loaded" });
  }, []);

  useEffect(() => {
    const image = imageRef.current;
    // A historical URL cache cannot prove a newly mounted node decoded successfully (or even loaded).
    if (image?.complete && image.naturalWidth > 0) void revealDecodedImage(image, imageUrl);
  }, [imageUrl, revealDecodedImage]);

  function markLoaded(event: SyntheticEvent<HTMLImageElement>) {
    void revealDecodedImage(event.currentTarget, imageUrl);
  }

  function markErrored(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    if (!isCurrentStageImage(image, imageRef.current, imageUrl)) return;
    setState({ image, imageUrl, status: "error" });
  }

  const current = state?.image === imageRef.current && state?.imageUrl === imageUrl;
  return {
    hasError: current && state?.status === "error",
    imageRef,
    markErrored,
    markLoaded,
    showImage: current && state?.status === "loaded",
  };
}
