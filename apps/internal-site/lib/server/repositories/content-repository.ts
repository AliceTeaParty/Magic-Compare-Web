import type { Asset } from "@prisma/client";
import type { ViewerDataset } from "@magic-compare/compare-core/viewer-data";
import type {
  CaseStatus,
  ImportManifest,
  ViewerMode,
} from "@magic-compare/content-schema";
import { DEMO_CASE_SLUG } from "@magic-compare/shared-utils";
import { validateImportManifest } from "@/lib/server/validators/import-manifest";
import { prisma } from "@/lib/server/db/client";
import { deletePublishedGroup } from "@/lib/server/storage/published-content";
import { deleteInternalAssetGroupDirectories } from "@/lib/server/storage/internal-assets";
import { isHiddenDemoCaseSlug, shouldHideDemoContent } from "@/lib/server/runtime-config";

interface CaseRowSummary {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  tags: string[];
  status: CaseStatus;
  publishedAt: string | null;
  updatedAt: string;
  groupCount: number;
  publicGroupCount: number;
}

export interface CaseSearchGroupSummary {
  slug: string;
  title: string;
}

export interface CaseSearchResult extends CaseRowSummary {
  groups: CaseSearchGroupSummary[];
}

export interface CaseWorkspaceGroup {
  id: string;
  slug: string;
  title: string;
  description: string;
  order: number;
  defaultMode: ViewerMode;
  isPublic: boolean;
  publicSlug: string | null;
  frameCount: number;
}

export interface CaseWorkspaceData {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  status: CaseStatus;
  publishedAt: string | null;
  tags: string[];
  groups: CaseWorkspaceGroup[];
}

function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function stringifyTags(tags: string[]): string {
  return JSON.stringify(tags);
}

function asViewerMode(input: string): ViewerMode {
  if (input === "a-b" || input === "heatmap" || input === "before-after") {
    return input;
  }

  return "before-after";
}

function asCaseStatus(input: string): CaseStatus {
  if (input === "draft" || input === "internal" || input === "published" || input === "archived") {
    return input;
  }

  return "draft";
}

function mapFrameAssets(assets: Asset[]) {
  return assets.map((asset) => ({
    id: asset.id,
    kind: asset.kind as "before" | "after" | "heatmap" | "crop" | "misc",
    label: asset.label,
    imageUrl: asset.imageUrl,
    thumbUrl: asset.thumbUrl,
    width: asset.width,
    height: asset.height,
    note: asset.note,
    isPrimaryDisplay: asset.isPrimaryDisplay,
  }));
}

function sortGroups<T extends { order: number }>(groups: T[]): T[] {
  return [...groups].sort((left, right) => left.order - right.order);
}

function sortFrames<T extends { order: number }>(frames: T[]): T[] {
  return [...frames].sort((left, right) => left.order - right.order);
}

export async function listCases(): Promise<CaseRowSummary[]> {
  const cases = await prisma.case.findMany({
    where: shouldHideDemoContent()
      ? {
          slug: {
            not: DEMO_CASE_SLUG,
          },
        }
      : undefined,
    include: {
      groups: {
        select: {
          isPublic: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return cases.map((caseRow) => ({
    id: caseRow.id,
    slug: caseRow.slug,
    title: caseRow.title,
    subtitle: caseRow.subtitle,
    summary: caseRow.summary,
    tags: parseTags(caseRow.tagsJson),
    status: asCaseStatus(caseRow.status),
    publishedAt: caseRow.publishedAt?.toISOString() ?? null,
    updatedAt: caseRow.updatedAt.toISOString(),
    groupCount: caseRow.groups.length,
    publicGroupCount: caseRow.groups.filter((group) => group.isPublic).length,
  }));
}

export async function searchCases(query: string, limit = 8): Promise<CaseSearchResult[]> {
  const normalizedQuery = query.trim();
  const hideDemo = shouldHideDemoContent();
  const cases = await prisma.case.findMany({
    where: hideDemo
      ? normalizedQuery
        ? {
            AND: [
              {
                slug: {
                  not: DEMO_CASE_SLUG,
                },
              },
              {
                OR: [
                  {
                    slug: {
                      contains: normalizedQuery,
                    },
                  },
                  {
                    title: {
                      contains: normalizedQuery,
                    },
                  },
                ],
              },
            ],
          }
        : {
            slug: {
              not: DEMO_CASE_SLUG,
            },
          }
      : normalizedQuery
        ? {
            OR: [
              {
                slug: {
                  contains: normalizedQuery,
                },
              },
              {
                title: {
                  contains: normalizedQuery,
                },
              },
            ],
          }
        : undefined,
    include: {
      groups: {
        select: {
          slug: true,
          title: true,
          isPublic: true,
          order: true,
        },
        orderBy: {
          order: "asc",
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });

  return cases.map((caseRow) => ({
    id: caseRow.id,
    slug: caseRow.slug,
    title: caseRow.title,
    subtitle: caseRow.subtitle,
    summary: caseRow.summary,
    tags: parseTags(caseRow.tagsJson),
    status: asCaseStatus(caseRow.status),
    publishedAt: caseRow.publishedAt?.toISOString() ?? null,
    updatedAt: caseRow.updatedAt.toISOString(),
    groupCount: caseRow.groups.length,
    publicGroupCount: caseRow.groups.filter((group) => group.isPublic).length,
    groups: sortGroups(caseRow.groups).map((group) => ({
      slug: group.slug,
      title: group.title,
    })),
  }));
}

export async function getCaseWorkspace(caseSlug: string): Promise<CaseWorkspaceData | null> {
  if (isHiddenDemoCaseSlug(caseSlug)) {
    return null;
  }

  const caseRow = await prisma.case.findUnique({
    where: { slug: caseSlug },
    include: {
      groups: {
        include: {
          _count: {
            select: {
              frames: true,
            },
          },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!caseRow) {
    return null;
  }

  return {
    id: caseRow.id,
    slug: caseRow.slug,
    title: caseRow.title,
    subtitle: caseRow.subtitle,
    summary: caseRow.summary,
    status: asCaseStatus(caseRow.status),
    publishedAt: caseRow.publishedAt?.toISOString() ?? null,
    tags: parseTags(caseRow.tagsJson),
    groups: sortGroups(caseRow.groups).map((group) => ({
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

export async function getViewerDataset(caseSlug: string, groupSlug: string): Promise<ViewerDataset | null> {
  if (isHiddenDemoCaseSlug(caseSlug)) {
    return null;
  }

  const caseRow = await prisma.case.findUnique({
    where: { slug: caseSlug },
    include: {
      groups: {
        include: {
          frames: {
            include: {
              assets: true,
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!caseRow) {
    return null;
  }

  const currentGroup = caseRow.groups.find((group) => group.slug === groupSlug);

  if (!currentGroup) {
    return null;
  }

  return {
    caseMeta: {
      slug: caseRow.slug,
      title: caseRow.title,
      subtitle: caseRow.subtitle,
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
      frames: sortFrames(currentGroup.frames).map((frame) => ({
        id: frame.id,
        title: frame.title,
        caption: frame.caption,
        order: frame.order,
        assets: mapFrameAssets(frame.assets),
      })),
    },
    siblingGroups: sortGroups(caseRow.groups).map((group) => ({
      id: group.id,
      title: group.title,
      href: `/cases/${caseRow.slug}/groups/${group.slug}`,
      isCurrent: group.id === currentGroup.id,
    })),
    publishStatus: {
      status: asCaseStatus(caseRow.status),
      publicSlug: currentGroup.publicSlug,
      publishedAt: caseRow.publishedAt?.toISOString() ?? null,
    },
  };
}

async function upsertGroup(groupEntry: ImportManifest["groups"][number], caseId: string) {
  const existingGroup = await prisma.group.findUnique({
    where: {
      caseId_slug: {
        caseId,
        slug: groupEntry.group.slug,
      },
    },
  });

  if (existingGroup) {
    await prisma.asset.deleteMany({
      where: {
        frame: {
          groupId: existingGroup.id,
        },
      },
    });
    await prisma.frame.deleteMany({
      where: {
        groupId: existingGroup.id,
      },
    });

    return prisma.group.update({
      where: { id: existingGroup.id },
      data: {
        title: groupEntry.group.title,
        description: groupEntry.group.description,
        order: groupEntry.group.order,
        defaultMode: groupEntry.group.defaultMode,
        isPublic: groupEntry.group.isPublic,
        tagsJson: stringifyTags(groupEntry.group.tags),
      },
    });
  }

  return prisma.group.create({
    data: {
      caseId,
      slug: groupEntry.group.slug,
      title: groupEntry.group.title,
      description: groupEntry.group.description,
      order: groupEntry.group.order,
      defaultMode: groupEntry.group.defaultMode,
      isPublic: groupEntry.group.isPublic,
      tagsJson: stringifyTags(groupEntry.group.tags),
    },
  });
}

export async function applyImportManifest(rawManifest: unknown) {
  const manifest = validateImportManifest(rawManifest);

  const caseRow = await prisma.case.upsert({
    where: {
      slug: manifest.case.slug,
    },
    update: {
      title: manifest.case.title,
      subtitle: manifest.case.subtitle,
      summary: manifest.case.summary,
      status: manifest.case.status,
      tagsJson: stringifyTags(manifest.case.tags),
    },
    create: {
      slug: manifest.case.slug,
      title: manifest.case.title,
      subtitle: manifest.case.subtitle,
      summary: manifest.case.summary,
      status: manifest.case.status,
      tagsJson: stringifyTags(manifest.case.tags),
    },
  });

  let coverAssetId: string | null = null;

  for (const groupEntry of manifest.groups) {
    const groupRow = await upsertGroup(groupEntry, caseRow.id);

    for (const frameEntry of groupEntry.frames) {
      const frameRow = await prisma.frame.create({
        data: {
          groupId: groupRow.id,
          title: frameEntry.frame.title,
          caption: frameEntry.frame.caption,
          order: frameEntry.frame.order,
          isPublic: frameEntry.frame.isPublic,
        },
      });

      for (const assetEntry of frameEntry.assets) {
        const assetRow = await prisma.asset.create({
          data: {
            frameId: frameRow.id,
            kind: assetEntry.kind,
            label: assetEntry.label,
            imageUrl: assetEntry.imageUrl,
            thumbUrl: assetEntry.thumbUrl,
            width: assetEntry.width,
            height: assetEntry.height,
            note: assetEntry.note,
            isPublic: assetEntry.isPublic,
            isPrimaryDisplay: assetEntry.isPrimaryDisplay,
          },
        });

        if (!coverAssetId && manifest.case.coverAssetLabel && assetEntry.label === manifest.case.coverAssetLabel) {
          coverAssetId = assetRow.id;
        }

        if (!coverAssetId && assetEntry.kind === "after" && assetEntry.isPrimaryDisplay) {
          coverAssetId = assetRow.id;
        }
      }
    }
  }

  await prisma.case.update({
    where: { id: caseRow.id },
    data: {
      coverAssetId,
    },
  });

  return {
    caseId: caseRow.id,
    slug: caseRow.slug,
    importedGroups: manifest.groups.length,
  };
}

export async function reorderGroups(caseId: string, groupIds: string[]): Promise<void> {
  await prisma.$transaction(
    groupIds.map((groupId, order) =>
      prisma.group.updateMany({
        where: {
          id: groupId,
          caseId,
        },
        data: { order },
      }),
    ),
  );
}

export async function reorderFrames(groupId: string, frameIds: string[]): Promise<void> {
  await prisma.$transaction(
    frameIds.map((frameId, order) =>
      prisma.frame.updateMany({
        where: {
          id: frameId,
          groupId,
        },
        data: { order },
      }),
    ),
  );
}

export async function deleteGroup(caseSlug: string, groupSlug: string) {
  const caseRow = await prisma.case.findUnique({
    where: { slug: caseSlug },
    include: {
      groups: {
        select: {
          id: true,
          slug: true,
          title: true,
          isPublic: true,
          publicSlug: true,
        },
      },
    },
  });

  if (!caseRow) {
    throw new Error("Case not found.");
  }

  const targetGroup = caseRow.groups.find((group) => group.slug === groupSlug);

  if (!targetGroup) {
    throw new Error("Group not found.");
  }

  await prisma.group.delete({
    where: { id: targetGroup.id },
  });

  await deleteInternalAssetGroupDirectories(caseSlug, groupSlug);

  if (targetGroup.publicSlug) {
    await deletePublishedGroup(targetGroup.publicSlug);
  }

  const remainingPublicGroups = caseRow.groups.filter(
    (group) => group.id !== targetGroup.id && group.isPublic,
  ).length;

  if (caseRow.status === "published" && remainingPublicGroups === 0) {
    await prisma.case.update({
      where: { id: caseRow.id },
      data: {
        status: "internal",
        publishedAt: null,
      },
    });
  }

  return {
    caseSlug: caseRow.slug,
    groupSlug: targetGroup.slug,
    groupTitle: targetGroup.title,
    removedPublishedBundle: Boolean(targetGroup.publicSlug),
    publicSlug: targetGroup.publicSlug,
  };
}
