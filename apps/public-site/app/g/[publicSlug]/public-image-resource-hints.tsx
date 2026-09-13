"use client";

import { preconnect } from "react-dom";

/** Returns only network origins that benefit from a connection hint. */
export function getPublicAssetOrigin(assetBasePath: string): string | null {
  try {
    const assetUrl = new URL(assetBasePath);
    return assetUrl.protocol === "http:" || assetUrl.protocol === "https:" ? assetUrl.origin : null;
  } catch {
    return null;
  }
}

/** Starts the public asset connection while the static viewer HTML is still being parsed. */
export function PublicImageResourceHints({ assetBasePath }: { assetBasePath: string }) {
  const assetOrigin = getPublicAssetOrigin(assetBasePath);
  if (assetOrigin) {
    // Public originals normally live on R2. Opening that connection during SSR saves its DNS/TLS
    // setup from sitting in front of the first multi-megabyte image request on slower networks.
    preconnect(assetOrigin);
  }

  return null;
}
