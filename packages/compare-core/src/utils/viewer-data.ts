import type {
  AssetKind,
  AssetRecord,
  CaseStatus,
  PublishImagePlaceholder,
  PublishManifest,
  ViewerMode,
} from "@magic-compare/content-schema";
import { orderByNumericOrder } from "@magic-compare/shared-utils";

export type ViewerAsset = Pick<
  AssetRecord,
  | "id"
  | "kind"
  | "label"
  | "imageUrl"
  | "thumbUrl"
  | "width"
  | "height"
  | "note"
  | "isPrimaryDisplay"
> & {
  placeholder?: PublishImagePlaceholder;
};

export interface ViewerFrame {
  id: string;
  title: string;
  caption: string;
  order: number;
  assets: ViewerAsset[];
}

export interface ViewerGroupLink {
  id: string;
  title: string;
  href: string;
  isCurrent?: boolean;
  preloadAssets?: ViewerAssetPreloadHint[];
}

export interface ViewerAssetPreloadHint {
  imageUrl: string;
}

export interface ViewerGroup {
  id: string;
  slug: string;
  publicSlug?: string | null;
  title: string;
  description: string;
  defaultMode: ViewerMode;
  tags: string[];
  isPublic: boolean;
  frames: ViewerFrame[];
}

export interface ViewerCaseMeta {
  slug: string;
  title: string;
  summary: string;
  status?: CaseStatus;
  tags: string[];
  publishedAt?: string | null;
}

export interface ViewerPublishStatus {
  status: CaseStatus;
  publicSlug?: string | null;
  publicUrl?: string | null;
  publishedAt?: string | null;
}

export interface ViewerDataset {
  caseMeta: ViewerCaseMeta;
  group: ViewerGroup;
  siblingGroups: ViewerGroupLink[];
  publishStatus?: ViewerPublishStatus;
}

export function findAsset(frame: ViewerFrame, kind: AssetKind): ViewerAsset | undefined {
  return frame.assets.find((asset) => asset.kind === kind);
}

/**
 * Uses semantic column identity instead of row-specific database ids so a selected comparison
 * target can follow the reviewer while they move between frames in the same group.
 */
export function getComparisonAssetKey(asset: ViewerAsset): string {
  return `${asset.kind}:${asset.label.trim().toLowerCase()}`;
}

/**
 * Returns every derived image that can occupy the comparison side. Heatmaps and crops have
 * different inspection semantics, so they remain outside the ordinary source/output selector.
 */
export function getComparisonTargetAssets(frame: ViewerFrame): ViewerAsset[] {
  const seenKeys = new Set<string>();

  return frame.assets.filter((asset) => {
    if (asset.kind !== "after" && asset.kind !== "misc") {
      return false;
    }

    const key = getComparisonAssetKey(asset);
    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

export interface AbAssetSelection {
  comparisonAssetKey?: string;
  side: "before" | "after";
}

/**
 * Advances A/B inspection through the baseline and every visible comparison column. Keeping this
 * in core prevents stage clicks and keyboard controls from reducing multi-variable groups to a
 * binary before/after toggle.
 */
export function getNextAbAssetSelection(
  current: AbAssetSelection,
  comparisonAssets: ViewerAsset[],
): AbAssetSelection {
  if (comparisonAssets.length === 0) {
    return { side: "before" };
  }

  if (current.side === "before") {
    return {
      comparisonAssetKey: getComparisonAssetKey(comparisonAssets[0]),
      side: "after",
    };
  }

  const currentIndex = comparisonAssets.findIndex(
    (asset) => getComparisonAssetKey(asset) === current.comparisonAssetKey,
  );
  const nextIndex = currentIndex + 1;

  if (currentIndex === -1 || nextIndex < comparisonAssets.length) {
    return {
      comparisonAssetKey: getComparisonAssetKey(comparisonAssets[Math.max(0, nextIndex)]),
      side: "after",
    };
  }

  return { side: "before" };
}

export function hasHeatmap(frame: ViewerFrame): boolean {
  return Boolean(findAsset(frame, "heatmap"));
}

export function getAvailableModes(frame: ViewerFrame): ViewerMode[] {
  const modes: ViewerMode[] = ["before-after", "a-b"];

  // Live analysis works for old groups without a precomputed heatmap.
  if (
    hasHeatmap(frame) ||
    (findAsset(frame, "before") && getComparisonTargetAssets(frame).length > 0)
  ) {
    modes.push("heatmap");
  }

  return modes;
}

export function resolveViewerMode(
  requestedMode: ViewerMode,
  frame: ViewerFrame | undefined,
  fallbackMode: ViewerMode,
): ViewerMode {
  if (!frame) {
    return fallbackMode;
  }

  const modes = getAvailableModes(frame);
  if (modes.includes(requestedMode)) {
    return requestedMode;
  }

  if (modes.includes(fallbackMode)) {
    return fallbackMode;
  }

  return "before-after";
}

export function createViewerDatasetFromPublishManifest(manifest: PublishManifest): ViewerDataset {
  return {
    caseMeta: {
      slug: manifest.case.slug,
      title: manifest.case.title,
      summary: manifest.case.summary,
      tags: manifest.case.tags,
      publishedAt: manifest.case.publishedAt,
      status: "published",
    },
    group: {
      id: manifest.group.id,
      slug: manifest.group.slug,
      publicSlug: manifest.group.publicSlug,
      title: manifest.group.title,
      description: manifest.group.description,
      defaultMode: manifest.group.defaultMode,
      tags: manifest.group.tags,
      isPublic: true,
      frames: orderByNumericOrder(manifest.frames).map((frame) => ({
        id: frame.id,
        title: frame.title,
        caption: frame.caption,
        order: frame.order,
        assets: frame.assets.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          label: asset.label,
          imageUrl: asset.imageUrl,
          thumbUrl: asset.thumbUrl,
          width: asset.width,
          height: asset.height,
          note: asset.note,
          isPrimaryDisplay: asset.isPrimaryDisplay,
          placeholder: asset.placeholder,
        })),
      })),
    },
    siblingGroups: [
      {
        id: manifest.group.id,
        title: manifest.group.title,
        href: `/g/${manifest.publicSlug}`,
        isCurrent: true,
        preloadAssets: [],
      },
    ],
    publishStatus: {
      status: "published",
      publicSlug: manifest.publicSlug,
      publicUrl: null,
      publishedAt: manifest.case.publishedAt,
    },
  };
}
