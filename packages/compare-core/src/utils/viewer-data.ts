import type {
  AssetKind,
  AssetRecord,
  CaseStatus,
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
>;

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
  subtitle: string;
  summary: string;
  status?: CaseStatus;
  tags: string[];
  publishedAt?: string | null;
}

export interface ViewerPublishStatus {
  status: CaseStatus;
  publicSlug?: string | null;
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

export function getPrimaryAssets(frame: ViewerFrame): ViewerAsset[] {
  return frame.assets.filter((asset) => asset.isPrimaryDisplay);
}

export function hasHeatmap(frame: ViewerFrame): boolean {
  return Boolean(findAsset(frame, "heatmap"));
}

export function getAvailableModes(frame: ViewerFrame): ViewerMode[] {
  const modes: ViewerMode[] = ["before-after", "a-b"];

  if (hasHeatmap(frame)) {
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

export function createViewerDatasetFromPublishManifest(
  manifest: PublishManifest,
): ViewerDataset {
  return {
    caseMeta: {
      slug: manifest.case.slug,
      title: manifest.case.title,
      subtitle: manifest.case.subtitle,
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
        })),
      })),
    },
    siblingGroups: [
      {
        id: manifest.group.id,
        title: manifest.group.title,
        href: `/g/${manifest.publicSlug}`,
        isCurrent: true,
      },
    ],
    publishStatus: {
      status: "published",
      publicSlug: manifest.publicSlug,
      publishedAt: manifest.case.publishedAt,
    },
  };
}
