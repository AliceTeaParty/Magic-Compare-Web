import type { PublishImagePlaceholder } from "@magic-compare/content-schema";
import { generatePublishImagePlaceholder } from "../publish/publish-image-placeholders";
import { readInternalAssetBytes } from "./internal-assets";

/** Generate before writing an immutable Asset so the first Viewer response already has its preview. */
export async function generateAssetPlaceholderJson(thumbUrl: string): Promise<string | null> {
  try {
    const bytes = await readInternalAssetBytes(thumbUrl, 8 * 1024 * 1024);
    return JSON.stringify(await generatePublishImagePlaceholder(bytes));
  } catch {
    // Optional preview failures must not invalidate an uploaded original. A maintenance backfill
    // can retry null fields; the Viewer renders a neutral surface without a second loading graphic.
    return null;
  }
}

/** This JSON is written only by the thumbnail generator, never supplied by a client. */
export function readAssetPlaceholder(
  json: string | null | undefined,
): PublishImagePlaceholder | undefined {
  return json ? (JSON.parse(json) ?? undefined) : undefined;
}
