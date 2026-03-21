import { prisma } from "@/lib/server/db/client";
import { deletePublishedGroup } from "@/lib/server/storage/published-content";
import { deleteInternalAssetGroupObjects } from "@/lib/server/storage/internal-assets";

async function requireCaseWithGroups(caseSlug: string, select: {
  id: true;
  slug: true;
  title?: true;
  isPublic?: true;
  publicSlug?: true;
}): Promise<{
  id: string;
  slug: string;
  status?: string;
  groups: Array<{
    id: string;
    slug: string;
    title?: string;
    isPublic?: boolean;
    publicSlug?: string | null;
  }>;
}> {
  const caseRow = await prisma.case.findUnique({
    where: { slug: caseSlug },
    include: {
      groups: {
        select,
      },
    },
  });

  if (!caseRow) {
    throw new Error("Case not found.");
  }

  return caseRow;
}

function requireTargetGroup<T extends { slug: string }>(groups: T[], groupSlug: string): T {
  const targetGroup = groups.find((group) => group.slug === groupSlug);

  if (!targetGroup) {
    throw new Error("Group not found.");
  }

  return targetGroup;
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

export async function setGroupVisibility(caseSlug: string, groupSlug: string, isPublic: boolean) {
  const caseRow = await requireCaseWithGroups(caseSlug, {
    id: true,
    slug: true,
    title: true,
    isPublic: true,
  });
  const targetGroup = requireTargetGroup(caseRow.groups, groupSlug);

  await prisma.group.update({
    where: { id: targetGroup.id },
    data: {
      isPublic,
    },
  });

  return {
    caseSlug: caseRow.slug,
    groupSlug: targetGroup.slug,
    isPublic,
  };
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

  const targetGroup = requireTargetGroup(caseRow.groups, groupSlug);

  await prisma.group.delete({
    where: { id: targetGroup.id },
  });

  await deleteInternalAssetGroupObjects(caseSlug, groupSlug);

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
