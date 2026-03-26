import { prisma } from "@/lib/server/db/client";
import { deletePublishedGroup } from "@/lib/server/storage/published-content";
import { deleteInternalAssetPrefix } from "@/lib/server/storage/internal-assets";
import {
  recomputeCaseCoverAsset,
  syncCasePublicationState,
} from "./case-maintenance";

/**
 * Centralizes the "case must exist before mutating one of its groups" guard so write paths fail
 * with the same message instead of each route inventing its own not-found handling.
 */
async function requireCaseWithGroups(
  caseSlug: string,
  select: {
    id: true;
    slug: true;
    title?: true;
    isPublic?: true;
    publicSlug?: true;
  },
): Promise<{
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

/**
 * Keeps group lookup errors uniform across reorder/visibility/delete flows so API responses stay
 * predictable when the client works on stale workspace state.
 */
function requireTargetGroup<T extends { slug: string }>(
  groups: T[],
  groupSlug: string,
): T {
  const targetGroup = groups.find((group) => group.slug === groupSlug);

  if (!targetGroup) {
    throw new Error("Group not found.");
  }

  return targetGroup;
}

/**
 * Persists the exact ordering emitted by the drag-and-drop client, because the workspace already
 * resolved ordering semantics and the server should not second-guess that sequence.
 */
export async function reorderGroups(
  caseId: string,
  groupIds: string[],
): Promise<void> {
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

/**
 * Mirrors frame reorder state from the client as-is so group viewers and import/publish pipelines
 * continue to agree on frame order.
 */
export async function reorderFrames(
  groupId: string,
  frameIds: string[],
): Promise<void> {
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

/**
 * Toggles a group's public eligibility without publishing immediately, so workspace edits can stay
 * batched and the operator decides when the public bundle should refresh.
 */
export async function setGroupVisibility(
  caseSlug: string,
  groupSlug: string,
  isPublic: boolean,
) {
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

/**
 * Deletes the group from both internal storage and published output, and downgrades the case back
 * to `internal` when that deletion removed the last public group.
 */
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
          storageRoot: true,
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

  if (targetGroup.storageRoot) {
    await deleteInternalAssetPrefix(targetGroup.storageRoot);
  }

  if (targetGroup.publicSlug) {
    await deletePublishedGroup(targetGroup.publicSlug);
  }

  await recomputeCaseCoverAsset(caseRow.id);
  await syncCasePublicationState(caseRow.id);

  return {
    caseSlug: caseRow.slug,
    groupSlug: targetGroup.slug,
    groupTitle: targetGroup.title,
    removedPublishedBundle: Boolean(targetGroup.publicSlug),
    publicSlug: targetGroup.publicSlug,
  };
}

/**
 * Case deletion is intentionally shallow and only allowed for empty cases so operators cannot
 * trigger recursive object-store cleanup through one overly broad API call.
 */
export async function deleteCase(caseSlug: string) {
  const caseRow = await prisma.case.findUnique({
    where: { slug: caseSlug },
    include: {
      groups: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!caseRow) {
    throw new Error("Case not found.");
  }

  if (caseRow.groups.length > 0) {
    throw new Error("Case must be empty before deletion.");
  }

  await prisma.case.delete({
    where: { id: caseRow.id },
  });

  return {
    caseSlug: caseRow.slug,
    deleted: true,
  };
}
