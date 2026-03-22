import { extname } from "node:path";
import type { ImportManifest } from "@magic-compare/content-schema";
import { readInternalAssetPrefix } from "./internal-assets";

type PublicAssetLike = {
  kind: string;
  imageUrl: string;
  thumbUrl: string;
};

type PublicFrameLike = {
  title: string;
  assets: PublicAssetLike[];
};

const decoder = new TextDecoder("utf-8");
const KEY_ASSET_KINDS = new Set(["before", "after", "heatmap"]);

function hasPrefix(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const preview = decoder.decode(bytes).trimStart();
  return preview.startsWith("<svg") || (preview.startsWith("<?xml") && preview.includes("<svg"));
}

function looksLikeAvif(bytes: Uint8Array): boolean {
  return (
    decoder.decode(bytes.slice(4, 16)).includes("ftyp") &&
    decoder.decode(bytes.slice(8, 24)).includes("avif")
  );
}

/**
 * Keep server-side validation cheap because uploader already did the expensive decode step; this
 * layer only needs to catch obviously wrong or masqueraded objects before import/publish proceeds.
 */
function assertLikelyImageBytes(assetUrl: string, bytes: Uint8Array): void {
  const extension = extname(assetUrl).toLowerCase();

  if (extension === ".png" && hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return;
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
      return;
    }
  }
  if (extension === ".webp") {
    if (
      decoder.decode(bytes.slice(0, 4)) === "RIFF" &&
      decoder.decode(bytes.slice(8, 12)) === "WEBP"
    ) {
      return;
    }
  }
  if (extension === ".avif" && looksLikeAvif(bytes)) {
    return;
  }
  if (extension === ".svg" && looksLikeSvg(bytes)) {
    return;
  }

  throw new Error(`Asset "${assetUrl}" does not look like a valid ${extension || "image"} file.`);
}

/**
 * The server only checks a short object prefix because uploader already did the real decode step;
 * this is just a cheap guardrail against obviously broken or disguised files reaching import/publish.
 */
export async function assertLikelyImageAssetUrl(assetUrl: string): Promise<void> {
  const bytes = await readInternalAssetPrefix(assetUrl);
  assertLikelyImageBytes(assetUrl, bytes);
}

/**
 * Import should only validate the key compare assets so the server stays lightweight and does not
 * turn every misc/crop object into a second full validation pass.
 */
export async function assertLikelyImportManifestAssets(manifest: ImportManifest): Promise<void> {
  for (const groupEntry of manifest.groups) {
    for (const frameEntry of groupEntry.frames) {
      for (const assetEntry of frameEntry.assets) {
        if (!KEY_ASSET_KINDS.has(assetEntry.kind)) {
          continue;
        }
        await assertLikelyImageAssetUrl(assetEntry.imageUrl);
        await assertLikelyImageAssetUrl(assetEntry.thumbUrl);
      }
    }
  }
}

/**
 * Publish re-checks only the public compare assets so a corrupted bucket object cannot silently
 * slip into the generated public manifest after import time.
 */
export async function assertLikelyPublicFrameAssets(frame: PublicFrameLike): Promise<void> {
  for (const asset of frame.assets) {
    if (!KEY_ASSET_KINDS.has(asset.kind)) {
      continue;
    }
    await assertLikelyImageAssetUrl(asset.imageUrl);
    await assertLikelyImageAssetUrl(asset.thumbUrl);
  }
}
