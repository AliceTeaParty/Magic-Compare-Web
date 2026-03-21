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

/**
 * Buckets unexpected asset kinds under `misc` so the viewer can keep rendering legacy or
 * experimental assets without widening every downstream union immediately.
 */
function asAssetKind(kind: string): AssetKind {
  if (kind === "before" || kind === "after" || kind === "heatmap" || kind === "crop") {
    return kind;
  }

  return "misc";
}

/**
 * Treats malformed tag JSON as empty metadata because imported content should stay browsable even
 * if a legacy row contains bad tag serialization.
 */
export function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Serializes tags in one place so import, edit, and publish paths keep the same storage shape.
 */
export function stringifyTags(tags: string[]): string {
  return JSON.stringify(tags);
}

/**
 * Falls back to swipe mode because it is the safest viewer default when stored data contains an
 * outdated mode string.
 */
export function asViewerMode(input: string): ViewerMode {
  if (input === "a-b" || input === "heatmap" || input === "before-after") {
    return input;
  }

  return "before-after";
}

/**
 * Falls back to draft so unexpected status values fail closed instead of making internal content
 * appear published in the UI.
 */
export function asCaseStatus(input: string): CaseStatus {
  if (input === "draft" || input === "internal" || input === "published" || input === "archived") {
    return input;
  }

  return "draft";
}

/**
 * Re-sorts copies instead of mutating the caller's array so Prisma payloads can be reused by other
 * mappers without hidden ordering side effects.
 */
export function sortByOrder<T extends OrderedItem>(items: T[]): T[] {
  return [...items].sort((left, right) => left.order - right.order);
}

/**
 * Converts storage-layer assets into viewer-ready URLs once so every consumer gets the same public
 * URL rewriting and asset kind normalization.
 */
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

/**
 * Produces the catalog card shape directly from the database row so list and search results share a
 * stable summary model instead of duplicating status/tag counting logic in multiple places.
 */
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

/**
 * Reuses the catalog summary mapper so search results stay structurally aligned with the main case
 * listing while adding only the extra group matches the search UI needs.
 */
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

/**
 * Shapes the internal workspace payload so the board gets explicit publish and frame counts without
 * leaking raw Prisma fields into the component tree.
 */
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

/**
 * Builds the full viewer dataset in one place so route handlers can enforce visibility rules first
 * and UI code receives a ready-to-render compare model afterward.
 */
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
