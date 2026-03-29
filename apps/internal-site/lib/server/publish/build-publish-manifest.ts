import {
  PUBLISH_SCHEMA_VERSION,
  type PublishManifest,
} from "@magic-compare/content-schema";
import { asAssetKind, asViewerMode, parseTags } from "@/lib/server/content/mappers";
import {
  internalAssetPublicGroupBaseUrl,
  resolvePublicInternalAssetUrl,
} from "@/lib/server/storage/internal-assets";
import { getValidatedPublicAssets } from "./validate-public-frame";

type PublishableAsset = {
  id: string;
  kind: string;
  label: string;
  imageUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
  note: string;
  isPublic: boolean;
  isPrimaryDisplay: boolean;
};

type PublishableFrame = {
  id: string;
  title: string;
  caption: string;
  order: number;
  isPublic: boolean;
  assets: PublishableAsset[];
};

type PublishableGroup = {
  id: string;
  slug: string;
  storageRoot: string;
  title: string;
  description: string;
  defaultMode: string;
  tagsJson: string;
  frames: PublishableFrame[];
};

type PublishableCase = {
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string;
  tagsJson: string;
};

type PublishManifestAsset = PublishManifest["frames"][number]["assets"][number];

function isRawPublicBucketHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized.endsWith(".r2.dev") ||
    normalized.endsWith(".r2.cloudflarestorage.com") ||
    normalized === "r2.dev" ||
    normalized === "cloudflarestorage.com"
  );
}

function assertPublicAssetDeliveryUrl(url: string): string {
  const normalized = new URL(url).toString();
  const hostname = new URL(normalized).hostname;

  // Published bundles are the point where internal assets become publicly discoverable. Reject raw
  // bucket hosts here so shareable pages do not leak direct object-storage URLs to scrapers.
  if (process.env.NODE_ENV === "production" && isRawPublicBucketHost(hostname)) {
    throw new Error(
      `Published assets must use a Cloudflare-proxied public image hostname, not a raw bucket host (${hostname}).`,
    );
  }

  return normalized;
}

/**
 * Resolves internal asset URLs into their public equivalents at publish time so the generated
 * manifest is self-contained and safe to serve from the static site.
 */
function mapManifestAssets(assets: PublishableAsset[]): PublishManifestAsset[] {
  return assets.map((asset) => ({
    id: asset.id,
    kind: asAssetKind(asset.kind),
    label: asset.label,
    imageUrl: assertPublicAssetDeliveryUrl(
      resolvePublicInternalAssetUrl(asset.imageUrl),
    ),
    thumbUrl: assertPublicAssetDeliveryUrl(
      resolvePublicInternalAssetUrl(asset.thumbUrl),
    ),
    width: asset.width,
    height: asset.height,
    note: asset.note,
    isPrimaryDisplay: asset.isPrimaryDisplay,
  }));
}

/**
 * Builds the public manifest only from explicitly public frames so export/deploy cannot leak
 * internal-only comparisons into the static site.
 */
export function buildPublishManifest(params: {
  caseRow: PublishableCase;
  group: PublishableGroup;
  publicSlug: string;
  publishedAt: Date;
}): PublishManifest | null {
  const { caseRow, group, publicSlug, publishedAt } = params;
  const publicFrames = group.frames.filter((frame) => frame.isPublic);

  if (publicFrames.length === 0) {
    // Empty published groups are skipped entirely so the public site never renders placeholder pages.
    return null;
  }

  return {
    schemaVersion: PUBLISH_SCHEMA_VERSION,
    publicSlug,
    generatedAt: publishedAt.toISOString(),
    assetBasePath: assertPublicAssetDeliveryUrl(
      internalAssetPublicGroupBaseUrl(group.storageRoot),
    ),
    case: {
      slug: caseRow.slug,
      title: caseRow.title,
      subtitle: caseRow.subtitle ?? "", // @deprecated — kept for PublishManifest schema compat
      summary: caseRow.summary,
      tags: parseTags(caseRow.tagsJson),
      publishedAt: publishedAt.toISOString(),
    },
    group: {
      id: group.id,
      slug: group.slug,
      publicSlug,
      title: group.title,
      description: group.description,
      defaultMode: asViewerMode(group.defaultMode),
      tags: parseTags(group.tagsJson),
    },
    frames: publicFrames.map((frame) => ({
      id: frame.id,
      title: frame.title,
      caption: frame.caption,
      order: frame.order,
      assets: mapManifestAssets(getValidatedPublicAssets(frame)),
    })),
  };
}
