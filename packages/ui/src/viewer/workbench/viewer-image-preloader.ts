"use client";

import {
  getComparisonAssetKey,
  getComparisonTargetAssets,
  type ViewerAsset,
  type ViewerAssetPreloadHint,
  type ViewerFrame,
} from "@magic-compare/compare-core/viewer-data";
import type { ViewerMode } from "@magic-compare/content-schema";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ViewerImagePreloadQueue,
  type ViewerPreloadImageHandle,
} from "./viewer-image-preloader-core";
import { markViewerStageImageLoaded } from "./stage-image-load-cache";

const FRAME_PRELOAD_SCOPE = "active-frame-window";

export interface ViewerConnectionInfo {
  effectiveType?: string;
  saveData?: boolean;
}

export interface ViewerImagePreloader {
  preloadFrame: (frame: ViewerFrame | undefined) => void;
  preloadGroupHint: (assets: ViewerAssetPreloadHint[] | undefined) => void;
}

function getConnectionInfo(): ViewerConnectionInfo | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  return (
    (
      navigator as Navigator & {
        connection?: {
          effectiveType?: string;
          saveData?: boolean;
        };
      }
    ).connection ?? null
  );
}

function getConnectionLimit(): number {
  const connection = getConnectionInfo();

  if (
    connection?.saveData ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g" ||
    connection?.effectiveType === "3g"
  ) {
    return 1;
  }

  return 2;
}

export function getFramePreloadRadiusForConnection(
  connection: ViewerConnectionInfo | null,
): number {
  if (
    connection?.saveData ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g" ||
    connection?.effectiveType === "3g"
  ) {
    return 0;
  }

  return 1;
}

function createBrowserImage(): ViewerPreloadImageHandle {
  const image = new Image();
  return {
    get src() {
      return image.src;
    },
    set src(nextSrc: string) {
      image.src = nextSrc;
    },
    get onload() {
      return image.onload as (() => void) | null;
    },
    set onload(nextHandler: (() => void) | null) {
      image.onload = nextHandler;
    },
    get onerror() {
      return image.onerror as (() => void) | null;
    },
    set onerror(nextHandler: (() => void) | null) {
      image.onerror = nextHandler;
    },
    get decoding() {
      return image.decoding;
    },
    set decoding(nextDecoding: "async" | "auto" | "sync" | undefined) {
      if (nextDecoding) {
        image.decoding = nextDecoding;
      }
    },
  };
}

function getPreloadAssetsForFrame(
  frame: ViewerFrame | undefined,
  mode: ViewerMode,
  comparisonAssetKey: string | undefined,
): ViewerAsset[] {
  if (!frame) {
    return [];
  }

  const beforeAsset = frame.assets.find((asset) => asset.kind === "before");
  const heatmapAsset = frame.assets.find((asset) => asset.kind === "heatmap");
  const comparisonAssets = getComparisonTargetAssets(frame);
  const comparisonAsset =
    comparisonAssets.find((asset) => getComparisonAssetKey(asset) === comparisonAssetKey) ??
    comparisonAssets[0];

  if (mode === "heatmap") {
    return [comparisonAsset, heatmapAsset].filter((asset): asset is ViewerAsset => Boolean(asset));
  }

  // Only the selected comparison pair can enter the stage. Other variables are fetched after the
  // corresponding selector receives explicit intent, avoiding hidden full-resolution downloads.
  return [beforeAsset, comparisonAsset].filter((asset): asset is ViewerAsset => Boolean(asset));
}

/**
 * Preloads likely next full-size viewer assets without tying image request churn to React renders.
 */
export function useViewerImagePreloader({
  comparisonAssetKey,
  currentFrameIndex,
  frames,
  mode,
}: {
  comparisonAssetKey: string | undefined;
  currentFrameIndex: number;
  frames: ViewerFrame[];
  mode: ViewerMode;
}): ViewerImagePreloader {
  const queueRef = useRef<ViewerImagePreloadQueue | null>(null);

  if (!queueRef.current && typeof window !== "undefined") {
    queueRef.current = new ViewerImagePreloadQueue({
      connectionLimit: getConnectionLimit,
      createImage: createBrowserImage,
      onLoad: markViewerStageImageLoaded,
    });
  }

  const enqueueUrl = useCallback((url: string | undefined | null, priority: number) => {
    queueRef.current?.enqueue(url, priority);
  }, []);

  const preloadFrame = useCallback(
    (frame: ViewerFrame | undefined) => {
      for (const asset of getPreloadAssetsForFrame(frame, mode, comparisonAssetKey)) {
        enqueueUrl(asset.imageUrl, 90);
      }
    },
    [comparisonAssetKey, enqueueUrl, mode],
  );

  const preloadGroupHint = useCallback(
    (assets: ViewerAssetPreloadHint[] | undefined) => {
      for (const asset of (assets ?? []).slice(0, 2)) {
        enqueueUrl(asset.imageUrl, 80);
      }
    },
    [enqueueUrl],
  );

  useEffect(() => {
    if (currentFrameIndex < 0) {
      return;
    }

    const radius = getFramePreloadRadiusForConnection(getConnectionInfo());
    const entries: Array<{ url: string; priority: number }> = [];
    const currentFrame = frames[currentFrameIndex];
    for (const asset of getPreloadAssetsForFrame(currentFrame, mode, comparisonAssetKey)) {
      entries.push({ url: asset.imageUrl, priority: 120 });
    }

    for (let offset = 1; offset <= radius; offset += 1) {
      const nextFrame = frames[currentFrameIndex + offset];
      const previousFrame = frames[currentFrameIndex - offset];

      for (const asset of getPreloadAssetsForFrame(nextFrame, mode, comparisonAssetKey)) {
        entries.push({ url: asset.imageUrl, priority: 70 - offset });
      }

      for (const asset of getPreloadAssetsForFrame(previousFrame, mode, comparisonAssetKey)) {
        entries.push({ url: asset.imageUrl, priority: 70 - offset });
      }
    }

    queueRef.current?.replaceScope(FRAME_PRELOAD_SCOPE, entries);
  }, [comparisonAssetKey, currentFrameIndex, frames, mode]);

  return useMemo(
    () => ({
      preloadFrame,
      preloadGroupHint,
    }),
    [preloadFrame, preloadGroupHint],
  );
}
