import { PUBLISH_SCHEMA_VERSION, type PublishManifest } from "@magic-compare/content-schema";
import { asViewerMode, parseTags } from "@/lib/server/content/mappers";
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

function asPublishManifestAssetKind(kind: string): PublishManifestAsset["kind"] {
  if (kind === "before" || kind === "after" || kind === "heatmap" || kind === "crop") {
    return kind;
  }

  return "misc";
}

function mapManifestAssets(assets: PublishableAsset[]): PublishManifestAsset[] {
  return assets.map((asset) => ({
    id: asset.id,
    kind: asPublishManifestAssetKind(asset.kind),
    label: asset.label,
    imageUrl: resolvePublicInternalAssetUrl(asset.imageUrl),
    thumbUrl: resolvePublicInternalAssetUrl(asset.thumbUrl),
    width: asset.width,
    height: asset.height,
    note: asset.note,
    isPrimaryDisplay: asset.isPrimaryDisplay,
  }));
}

export function buildPublishManifest(params: {
  caseRow: PublishableCase;
  group: PublishableGroup;
  publicSlug: string;
  publishedAt: Date;
}): PublishManifest | null {
  const { caseRow, group, publicSlug, publishedAt } = params;
  const publicFrames = group.frames.filter((frame) => frame.isPublic);

  if (publicFrames.length === 0) {
    return null;
  }

  return {
    schemaVersion: PUBLISH_SCHEMA_VERSION,
    publicSlug,
    generatedAt: publishedAt.toISOString(),
    assetBasePath: internalAssetPublicGroupBaseUrl(caseRow.slug, group.slug),
    case: {
      slug: caseRow.slug,
      title: caseRow.title,
      subtitle: caseRow.subtitle ?? "",
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
