import { hexFromArgb, sourceColorFromImageBytes } from "@material/material-color-utilities";
import {
  PUBLISH_PLACEHOLDER_DATA_URL_MAX_LENGTH,
  PUBLISH_SCHEMA_VERSION,
  type PublishImagePlaceholder,
  type PublishManifest,
} from "@magic-compare/content-schema";
import sharp from "sharp";
import { mapWithConcurrency } from "@/lib/server/concurrency/map-with-concurrency";
import { readInternalAssetBytes } from "@/lib/server/storage/internal-assets";

const PLACEHOLDER_CONCURRENCY = 4;
const PLACEHOLDER_LONG_EDGE = 8;
const COLOR_SAMPLE_LONG_EDGE = 32;
const THUMBNAIL_BYTE_LIMIT = 8 * 1024 * 1024;
const SHARP_INPUT_PIXEL_LIMIT = 32 * 1024 * 1024;

interface PlaceholderSourceAsset {
  id: string;
  thumbUrl: string;
}

interface PlaceholderGenerationOutcome {
  assetId: string;
  placeholder: PublishImagePlaceholder | null;
  status: "generated" | "reused" | "failed";
}

export interface PublishPlaceholderStats {
  generated: number;
  reused: number;
  failed: number;
}

interface EnrichPublishManifestParams {
  manifest: PublishManifest;
  previousManifest: PublishManifest | null;
  sourceAssets: readonly PlaceholderSourceAsset[];
  readThumbnail?: (logicalPath: string, maxByteCount: number) => Promise<Uint8Array>;
}

/**
 * Derives a tiny truthful preview and one Material source color from the same thumbnail decode.
 * The preview remains pixelated in the Viewer, while the larger color sample avoids selecting a
 * seed from too few pixels.
 */
export async function generatePublishImagePlaceholder(
  thumbnailBytes: Uint8Array,
): Promise<PublishImagePlaceholder | null> {
  const image = sharp(thumbnailBytes, { limitInputPixels: SHARP_INPUT_PIXEL_LIMIT }).rotate();
  const [previewBuffer, colorSample] = await Promise.all([
    image
      .clone()
      .resize({
        width: PLACEHOLDER_LONG_EDGE,
        height: PLACEHOLDER_LONG_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 35 })
      .toBuffer(),
    image
      .clone()
      .resize({
        width: COLOR_SAMPLE_LONG_EDGE,
        height: COLOR_SAMPLE_LONG_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer(),
  ]);

  const rgba = new Uint8ClampedArray(
    colorSample.buffer,
    colorSample.byteOffset,
    colorSample.byteLength,
  );
  let hasOpaquePixel = false;
  for (let offset = 3; offset < rgba.length; offset += 4) {
    if (rgba[offset] === 255) {
      hasOpaquePixel = true;
      break;
    }
  }
  if (!hasOpaquePixel) {
    return null;
  }

  const dataUrl = `data:image/webp;base64,${previewBuffer.toString("base64")}`;
  if (dataUrl.length > PUBLISH_PLACEHOLDER_DATA_URL_MAX_LENGTH) {
    throw new Error("Generated image placeholder exceeds the manifest size contract.");
  }

  return {
    dataUrl,
    sourceColor: hexFromArgb(sourceColorFromImageBytes(rgba)).toUpperCase(),
  };
}

function collectPreviousAssets(previousManifest: PublishManifest | null) {
  if (previousManifest?.schemaVersion !== PUBLISH_SCHEMA_VERSION) {
    return new Map<string, PublishManifest["frames"][number]["assets"][number]>();
  }

  return new Map(
    previousManifest.frames.flatMap((frame) =>
      frame.assets.map((asset) => [asset.id, asset] as const),
    ),
  );
}

/**
 * Reuses immutable thumbnail results from the previous snapshot and isolates all per-image failures
 * so optional loading polish cannot prevent otherwise valid content from being published.
 */
export async function enrichPublishManifestWithPlaceholders({
  manifest,
  previousManifest,
  sourceAssets,
  readThumbnail = readInternalAssetBytes,
}: EnrichPublishManifestParams): Promise<{
  manifest: PublishManifest;
  stats: PublishPlaceholderStats;
}> {
  const sourceById = new Map(sourceAssets.map((asset) => [asset.id, asset]));
  const previousById = collectPreviousAssets(previousManifest);
  const currentAssets = manifest.frames.flatMap((frame) => frame.assets);

  const outcomes = await mapWithConcurrency(
    currentAssets,
    PLACEHOLDER_CONCURRENCY,
    async (asset): Promise<PlaceholderGenerationOutcome> => {
      const previous = previousById.get(asset.id);
      if (previous?.thumbUrl === asset.thumbUrl && previous.placeholder) {
        return { assetId: asset.id, placeholder: previous.placeholder, status: "reused" };
      }

      const source = sourceById.get(asset.id);
      if (!source) {
        return { assetId: asset.id, placeholder: null, status: "failed" };
      }

      try {
        const bytes = await readThumbnail(source.thumbUrl, THUMBNAIL_BYTE_LIMIT);
        const placeholder = await generatePublishImagePlaceholder(bytes);
        return {
          assetId: asset.id,
          placeholder,
          status: placeholder ? "generated" : "failed",
        };
      } catch {
        return { assetId: asset.id, placeholder: null, status: "failed" };
      }
    },
  );

  const placeholdersById = new Map(
    outcomes
      .filter(
        (
          outcome,
        ): outcome is PlaceholderGenerationOutcome & {
          placeholder: PublishImagePlaceholder;
        } => Boolean(outcome.placeholder),
      )
      .map((outcome) => [outcome.assetId, outcome.placeholder]),
  );

  return {
    manifest: {
      ...manifest,
      frames: manifest.frames.map((frame) => ({
        ...frame,
        assets: frame.assets.map((asset) => {
          const placeholder = placeholdersById.get(asset.id);
          return placeholder ? { ...asset, placeholder } : asset;
        }),
      })),
    },
    stats: {
      generated: outcomes.filter((outcome) => outcome.status === "generated").length,
      reused: outcomes.filter((outcome) => outcome.status === "reused").length,
      failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    },
  };
}
