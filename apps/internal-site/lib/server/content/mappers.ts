import type { Asset } from "@prisma/client";
import type { ViewerDataset } from "@magic-compare/compare-core/viewer-data";
import type { CaseStatus, ViewerMode } from "@magic-compare/content-schema";
import { resolvePublishedGroupUrl } from "@/lib/server/public-site/url";
import { resolvePublicInternalAssetUrl } from "@/lib/server/storage/internal-assets";
import type {
  CaseCatalogItem,
  CaseSearchResult,
  CaseWorkspaceData,
} from "./types";

type OrderedItem = { order: number };

type AssetKind = "before" | "after" | "heatmap" | "crop" | "misc";

function asAssetKind(kind: string): AssetKind {
  if (kind === "before" || kind === "after" || kind === "heatmap" || kind === "crop") {
    return kind;
  }

  return "misc";
}

export function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

export function stringifyTags(tags: string[]): string {
  return JSON.stringify(tags);
}

export function asViewerMode(input: string): ViewerMode {
  if (input === "a-b" || input === "heatmap" || input === "before-after") {
    return input;
  }

  return "before-after";
}

export function asCaseStatus(input: string): CaseStatus {
  if (input === "draft" || input === "internal" || input === "published" || input === "archived") {
    return input;
  }

  return "draft";
}

export function sortByOrder<T extends OrderedItem>(items: T[]): T[] {
  return [...items].sort((left, right) => left.order - right.order);
}

export function mapFrameAssets(assets: Asset[]) {
  return assets.map((asset) => ({
    id: asset.id,
    kind: asAssetKind(asset.kind),
    label: asset.label,
    imageUrl: resolvePublicInternalAssetUrl(asset.imageUrl),
    thumbUrl: resolvePublicInternalAssetUrl(asset.thumbUrl),
    width: asset.width,
    height: asset.height,
    note: asset.note,
    isPrimaryDisplay: asset.isPrimaryDisplay,
  }));
}

export function mapCaseCatalogItem(caseRow: {
  id: string;
  slug: string;
  title: string;
  summary: string;
  tagsJson: string;
  status: string;
  publishedAt: Date | null;
  updatedAt: Date;
  groups: Array<{ isPublic: boolean }>;
}): CaseCatalogItem {
  return {
    id: caseRow.id,
    slug: caseRow.slug,
    title: caseRow.title,
    summary: caseRow.summary,
    tags: parseTags(caseRow.tagsJson),
    status: asCaseStatus(caseRow.status),
    publishedAt: caseRow.publishedAt?.toISOString() ?? null,
    updatedAt: caseRow.updatedAt.toISOString(),
    groupCount: caseRow.groups.length,
    publicGroupCount: caseRow.groups.filter((group) => group.isPublic).length,
  };
}

export function mapCaseSearchResult(caseRow: {
  id: string;
  slug: string;
  title: string;
  summary: string;
  tagsJson: string;
  status: string;
  publishedAt: Date | null;
  updatedAt: Date;
  groups: Array<{ slug: string; title: string; isPublic: boolean; order: number }>;
}): CaseSearchResult {
  const summary = mapCaseCatalogItem(caseRow);

  return {
    ...summary,
    groups: sortByOrder(caseRow.groups).map((group) => ({
      slug: group.slug,
      title: group.title,
    })),
  };
}

export function mapCaseWorkspaceData(caseRow: {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  publishedAt: Date | null;
  tagsJson: string;
  groups: Array<{
    id: string;
    slug: string;
    title: string;
    description: string;
    order: number;
    defaultMode: string;
    isPublic: boolean;
    publicSlug: string | null;
    _count: { frames: number };
  }>;
}): CaseWorkspaceData {
  return {
    id: caseRow.id,
    slug: caseRow.slug,
    title: caseRow.title,
    summary: caseRow.summary,
    status: asCaseStatus(caseRow.status),
    publishedAt: caseRow.publishedAt?.toISOString() ?? null,
    tags: parseTags(caseRow.tagsJson),
    groups: sortByOrder(caseRow.groups).map((group) => ({
      id: group.id,
      slug: group.slug,
      title: group.title,
      description: group.description,
      order: group.order,
      defaultMode: asViewerMode(group.defaultMode),
      isPublic: group.isPublic,
      publicSlug: group.publicSlug,
      frameCount: group._count.frames,
    })),
  };
}

export function buildViewerDataset(caseRow: {
  slug: string;
  title: string;
  summary: string;
  status: string;
  tagsJson: string;
  publishedAt: Date | null;
  groups: Array<{
    id: string;
    slug: string;
    publicSlug: string | null;
    title: string;
    description: string;
    defaultMode: string;
    tagsJson: string;
    isPublic: boolean;
    order: number;
    frames: Array<{
      id: string;
      title: string;
      caption: string;
      order: number;
      assets: Asset[];
    }>;
  }>;
}, currentGroup: {
  id: string;
  slug: string;
  publicSlug: string | null;
  title: string;
  description: string;
  defaultMode: string;
  tagsJson: string;
  isPublic: boolean;
  frames: Array<{
    id: string;
    title: string;
    caption: string;
    order: number;
    assets: Asset[];
  }>;
}): ViewerDataset {
  return {
    caseMeta: {
      slug: caseRow.slug,
      title: caseRow.title,
      summary: caseRow.summary,
      status: asCaseStatus(caseRow.status),
      tags: parseTags(caseRow.tagsJson),
      publishedAt: caseRow.publishedAt?.toISOString() ?? null,
    },
    group: {
      id: currentGroup.id,
      slug: currentGroup.slug,
      publicSlug: currentGroup.publicSlug,
      title: currentGroup.title,
      description: currentGroup.description,
      defaultMode: asViewerMode(currentGroup.defaultMode),
      tags: parseTags(currentGroup.tagsJson),
      isPublic: currentGroup.isPublic,
      frames: sortByOrder(currentGroup.frames).map((frame) => ({
        id: frame.id,
        title: frame.title,
        caption: frame.caption,
        order: frame.order,
        assets: mapFrameAssets(frame.assets),
      })),
    },
    siblingGroups: sortByOrder(caseRow.groups).map((group) => ({
      id: group.id,
      title: group.title,
      href: `/cases/${caseRow.slug}/groups/${group.slug}`,
      isCurrent: group.id === currentGroup.id,
    })),
    publishStatus: {
      status: asCaseStatus(caseRow.status),
      publicSlug: currentGroup.publicSlug,
      publicUrl: resolvePublishedGroupUrl(currentGroup.publicSlug),
      publishedAt: caseRow.publishedAt?.toISOString() ?? null,
    },
  };
}
