import type { PublishImagePlaceholder } from "@magic-compare/content-schema";
import { generatePublishImagePlaceholder } from "../publish/publish-image-placeholders";
import { readInternalAssetBytes } from "./internal-assets";
import { assertLikelyImageAssetUrl, assertLikelyImageBytes } from "./internal-asset-sanity";

const THUMBNAIL_BYTE_LIMIT = 8 * 1024 * 1024;

async function serializePlaceholder(bytes: Uint8Array): Promise<string | null> {
  try {
    return JSON.stringify(await generatePublishImagePlaceholder(bytes));
  } catch {
    return null;
  }
}

/** Generate before writing an immutable Asset so the first Viewer response already has its preview. */
export async function generateAssetPlaceholderJson(thumbUrl: string): Promise<string | null> {
  try {
    const bytes = await readInternalAssetBytes(thumbUrl, THUMBNAIL_BYTE_LIMIT);
    return serializePlaceholder(bytes);
  } catch {
    // Optional preview failures must not invalidate an uploaded original. A maintenance backfill
    // can retry null fields; the Viewer renders a neutral surface without a second loading graphic.
    return null;
  }
}

/** Reuse the preview read for image validation, falling back to a prefix read if full decode is unavailable. */
export async function validateAndGenerateAssetPlaceholderJson(
  thumbUrl: string,
): Promise<string | null> {
  let bytes: Uint8Array;
  try {
    bytes = await readInternalAssetBytes(thumbUrl, THUMBNAIL_BYTE_LIMIT);
  } catch {
    await assertLikelyImageAssetUrl(thumbUrl);
    return null;
  }

  assertLikelyImageBytes(thumbUrl, bytes.subarray(0, 512));
  return serializePlaceholder(bytes);
}

/** This JSON is written only by the thumbnail generator, never supplied by a client. */
export function readAssetPlaceholder(
  json: string | null | undefined,
): PublishImagePlaceholder | undefined {
  return json ? (JSON.parse(json) ?? undefined) : undefined;
}
