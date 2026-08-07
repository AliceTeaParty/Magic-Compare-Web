import type { Metadata } from "next";
import type { PublishManifest } from "@magic-compare/content-schema";
import {
  buildPublicShareImageData,
  buildPublicShareImagePath,
  PUBLIC_SHARE_IMAGE_HEIGHT,
  PUBLIC_SHARE_IMAGE_WIDTH,
} from "./share-image-data";

export const PUBLIC_SITE_NAME = "Magic Compare";
export const PUBLIC_SITE_DESCRIPTION = "逐帧查看原图、成品与热图，检查图像处理前后的差异。";

const MAX_PAGE_TITLE_LENGTH = 72;
const MAX_DESCRIPTION_LENGTH = 160;

function normalizeMetadataText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateMetadataText(value: string, maxLength: number): string {
  const characters = Array.from(normalizeMetadataText(value));
  if (characters.length <= maxLength) return characters.join("");
  return `${characters
    .slice(0, maxLength - 1)
    .join("")
    .trimEnd()}…`;
}

function buildComparisonTitle(manifest: PublishManifest): string {
  const groupTitle = normalizeMetadataText(manifest.group.title);
  const caseTitle = normalizeMetadataText(manifest.case.title);

  return truncateMetadataText(`${groupTitle} - ${caseTitle}`, MAX_PAGE_TITLE_LENGTH);
}

/** Keeps the public description tied to Group-authored copy instead of unrelated Case context. */
function buildComparisonDescription(manifest: PublishManifest, pageTitle: string): string {
  const authoredDescription = normalizeMetadataText(manifest.group.description);
  const frameSummary = `查看 ${pageTitle}，共 ${manifest.frames.length} 组对比图。`;

  return truncateMetadataText(
    authoredDescription ? `${frameSummary} ${authoredDescription}` : frameSummary,
    MAX_DESCRIPTION_LENGTH,
  );
}

function resolveHttpUrl(value: string, baseUrl: URL | null): URL | null {
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Prefers the standardized card when its absolute URL is known, with a real-image fallback. */
function buildPreviewImage(manifest: PublishManifest, baseUrl: URL | null) {
  const shareData = buildPublicShareImageData(manifest);
  if (baseUrl) {
    return {
      url: new URL(buildPublicShareImagePath(manifest.publicSlug), baseUrl),
      width: PUBLIC_SHARE_IMAGE_WIDTH,
      height: PUBLIC_SHARE_IMAGE_HEIGHT,
      type: "image/webp",
      alt: truncateMetadataText(shareData.alt, 120),
    };
  }

  const firstFrame = [...manifest.frames].sort((left, right) => left.order - right.order)[0];
  const asset = shareData.leftAsset;
  if (!asset) return null;

  const url = resolveHttpUrl(asset.imageUrl, baseUrl);
  if (!url) return null;

  return {
    url,
    width: asset.width,
    height: asset.height,
    alt: truncateMetadataText(`${shareData.title} · ${firstFrame.title} · ${asset.label}`, 120),
  };
}

/** Builds complete per-gallery metadata from the same manifest that renders the public viewer. */
export function buildPublicGroupMetadata(
  manifest: PublishManifest,
  publicSiteBaseUrl: URL | null,
): Metadata {
  const pageTitle = buildComparisonTitle(manifest);
  const socialTitle = truncateMetadataText(`${pageTitle} | ${PUBLIC_SITE_NAME}`, 95);
  const description = buildComparisonDescription(manifest, pageTitle);
  const canonicalUrl = publicSiteBaseUrl
    ? new URL(`/g/${encodeURIComponent(manifest.publicSlug)}`, publicSiteBaseUrl)
    : null;
  const previewImage = buildPreviewImage(manifest, publicSiteBaseUrl);

  return {
    title: pageTitle,
    description,
    ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: PUBLIC_SITE_NAME,
      title: socialTitle,
      description,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      ...(previewImage ? { images: [previewImage] } : {}),
    },
    twitter: {
      card: previewImage ? "summary_large_image" : "summary",
      title: socialTitle,
      description,
      ...(previewImage ? { images: [{ url: previewImage.url, alt: previewImage.alt }] } : {}),
    },
  };
}
