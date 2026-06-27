"use client";

import type {
  ViewerAsset,
  ViewerAssetPreloadHint,
  ViewerFrame,
} from "@magic-compare/compare-core/viewer-data";
import type { ViewerMode } from "@magic-compare/content-schema";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ViewerImagePreloadQueue,
  type ViewerPreloadImageHandle,
} from "./viewer-image-preloader-core";

const FRAME_PRELOAD_RADIUS = 2;

export interface ViewerImagePreloader {
  preloadFrame: (frame: ViewerFrame | undefined) => void;
  preloadGroupHint: (assets: ViewerAssetPreloadHint[] | undefined) => void;
}

function getConnectionInfo() {
  if (typeof navigator === "undefined") {
    return null;
  }

  return (
    navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        saveData?: boolean;
      };
    }
  ).connection;
}

function getConnectionLimit(): number {
  const connection = getConnectionInfo();

  if (
    connection?.saveData ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g"
  ) {
    return 1;
  }

  return 2;
}

function getFramePreloadRadius(): number {
  const connection = getConnectionInfo();

  if (connection?.saveData) {
    return 0;
  }

  if (
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g"
  ) {
    return 1;
  }

  return FRAME_PRELOAD_RADIUS;
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
): ViewerAsset[] {
  if (!frame) {
    return [];
  }

  const beforeAsset = frame.assets.find((asset) => asset.kind === "before");
  const afterAsset = frame.assets.find((asset) => asset.kind === "after");
  const heatmapAsset = frame.assets.find((asset) => asset.kind === "heatmap");

  if (mode === "heatmap") {
    return [afterAsset, heatmapAsset].filter(
      (asset): asset is ViewerAsset => Boolean(asset),
    );
  }

  return [beforeAsset, afterAsset].filter(
    (asset): asset is ViewerAsset => Boolean(asset),
  );
}

/**
 * Preloads likely next full-size viewer assets without tying image request churn to React renders.
 */
export function useViewerImagePreloader({
  currentFrameIndex,
  frames,
  mode,
}: {
  currentFrameIndex: number;
  frames: ViewerFrame[];
  mode: ViewerMode;
}): ViewerImagePreloader {
  const queueRef = useRef<ViewerImagePreloadQueue | null>(null);

  if (!queueRef.current && typeof window !== "undefined") {
    queueRef.current = new ViewerImagePreloadQueue({
      connectionLimit: getConnectionLimit,
      createImage: createBrowserImage,
    });
  }

  const enqueueUrl = useCallback(
    (url: string | undefined | null, priority: number) => {
      queueRef.current?.enqueue(url, priority);
    },
    [],
  );

  const preloadFrame = useCallback(
    (frame: ViewerFrame | undefined) => {
      for (const asset of getPreloadAssetsForFrame(frame, mode)) {
        enqueueUrl(asset.imageUrl, 90);
      }
    },
    [enqueueUrl, mode],
  );

  const preloadGroupHint = useCallback(
    (assets: ViewerAssetPreloadHint[] | undefined) => {
      for (const asset of assets ?? []) {
        enqueueUrl(asset.imageUrl, 80);
      }
    },
    [enqueueUrl],
  );

  useEffect(() => {
    if (currentFrameIndex < 0) {
      return;
    }

    const radius = getFramePreloadRadius();
    const currentFrame = frames[currentFrameIndex];
    for (const asset of getPreloadAssetsForFrame(currentFrame, mode)) {
      enqueueUrl(asset.imageUrl, 120);
    }

    for (let offset = 1; offset <= radius; offset += 1) {
      const nextFrame = frames[currentFrameIndex + offset];
      const previousFrame = frames[currentFrameIndex - offset];

      for (const asset of getPreloadAssetsForFrame(nextFrame, mode)) {
        enqueueUrl(asset.imageUrl, 70 - offset);
      }

      for (const asset of getPreloadAssetsForFrame(previousFrame, mode)) {
        enqueueUrl(asset.imageUrl, 70 - offset);
      }
    }
  }, [currentFrameIndex, enqueueUrl, frames, mode]);

  return useMemo(
    () => ({
      preloadFrame,
      preloadGroupHint,
    }),
    [preloadFrame, preloadGroupHint],
  );
}
