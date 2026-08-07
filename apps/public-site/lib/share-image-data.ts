import type { PublishManifest } from "@magic-compare/content-schema";

export const PUBLIC_SHARE_IMAGE_WIDTH = 1200;
export const PUBLIC_SHARE_IMAGE_HEIGHT = 630;
export const PUBLIC_SHARE_IMAGE_FILE_NAME = "share.jpg";

type PublishAsset = PublishManifest["frames"][number]["assets"][number];

export interface PublicShareImageData {
  title: string;
  countLabel: string;
  description: string;
  leftAsset: PublishAsset;
  rightAsset: PublishAsset;
  alt: string;
}

export function normalizeShareText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildPublicShareImagePath(publicSlug: string): string {
  return `/published/groups/${encodeURIComponent(publicSlug)}/${PUBLIC_SHARE_IMAGE_FILE_NAME}`;
}

/** Selects a stable A/B pair from the first ordered frame while preserving nonstandard labels. */
function selectShareAssets(manifest: PublishManifest): [PublishAsset, PublishAsset] {
  const firstFrame = [...manifest.frames].sort((left, right) => left.order - right.order)[0];
  const assets = firstFrame.assets;
  const leftAsset =
    assets.find((asset) => asset.kind === "before" && asset.isPrimaryDisplay) ??
    assets.find((asset) => asset.kind === "before") ??
    assets.find((asset) => asset.isPrimaryDisplay) ??
    assets[0];
  const rightAsset =
    assets.find((asset) => asset.kind === "after" && asset.isPrimaryDisplay) ??
    assets.find((asset) => asset.kind === "after") ??
    assets.find((asset) => asset.isPrimaryDisplay && asset.id !== leftAsset.id) ??
    assets.find((asset) => asset.id !== leftAsset.id) ??
    assets[1];

  return [leftAsset, rightAsset];
}

/** Builds the shared content contract used by both the renderer and social metadata. */
export function buildPublicShareImageData(manifest: PublishManifest): PublicShareImageData {
  const groupTitle = normalizeShareText(manifest.group.title);
  const caseTitle = normalizeShareText(manifest.case.title);
  const description = normalizeShareText(manifest.group.description);
  const title = `${groupTitle} - ${caseTitle}`;
  const countLabel = `${manifest.frames.length} Groups`;
  const [leftAsset, rightAsset] = selectShareAssets(manifest);

  return {
    title,
    countLabel,
    description,
    leftAsset,
    rightAsset,
    alt: `${title}，${countLabel} 图像对比`,
  };
}
