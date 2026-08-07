import { prisma } from "@/lib/server/db/client";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/server/api/errors";
import { publishCase } from "@/lib/server/publish/publish-case";
import { deletePublishedGroup } from "@/lib/server/storage/published-content";
import { deleteInternalAssetPrefix } from "@/lib/server/storage/internal-assets";
import { recomputeCaseCoverAsset, syncCasePublicationState } from "./case-maintenance";

/** Refreshes existing public content while leaving draft-only cases untouched. */
async function refreshPublishedCase(caseId: string): Promise<boolean> {
  const publicGroupCount = await prisma.group.count({
    where: { caseId, isPublic: true },
  });
  if (publicGroupCount === 0) return false;

  await publishCase(caseId);
  return true;
}

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
    throw new NotFoundError("Case not found.");
  }

  return caseRow;
}

/**
 * Keeps group lookup errors uniform across reorder/visibility/delete flows so API responses stay
 * predictable when the client works on stale workspace state.
 */
function requireTargetGroup<T extends { slug: string }>(groups: T[], groupSlug: string): T {
  const targetGroup = groups.find((group) => group.slug === groupSlug);

  if (!targetGroup) {
    throw new NotFoundError("Group not found.");
  }

  return targetGroup;
}

/**
 * Creates an empty internal workspace case only. Upload, publish, and public export remain explicit
 * follow-up actions so a new case cannot accidentally appear on the public site.
 */
export async function createCase(metadata: { slug: string; title: string; summary?: string }) {
  const slug = metadata.slug.trim();
  const title = metadata.title.trim();
  const summary = metadata.summary?.trim() ?? "";

  if (!title) {
    throw new BadRequestError("Case title is required.");
  }

  const existingCase = await prisma.case.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (existingCase) {
    throw new ConflictError("Case already exists.");
  }

  const caseRow = await prisma.case.create({
    data: {
      slug,
      title,
      summary,
      subtitle: "",
      tagsJson: "[]",
      status: "draft",
    },
    select: {
      slug: true,
      title: true,
      summary: true,
      status: true,
    },
  });

  return {
    caseSlug: caseRow.slug,
    title: caseRow.title,
    summary: caseRow.summary,
    status: caseRow.status,
  };
}

/**
 * Persists the exact ordering emitted by the drag-and-drop client, because the workspace already
 * resolved ordering semantics and the server should not second-guess that sequence.
 */
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
  await refreshPublishedCase(caseId);
}

/**
 * Toggles a group's public eligibility and synchronizes the published bundle before returning.
 */
export async function setGroupVisibility(caseSlug: string, groupSlug: string, isPublic: boolean) {
  const caseRow = await requireCaseWithGroups(caseSlug, {
    id: true,
    slug: true,
    title: true,
    isPublic: true,
    publicSlug: true,
  });
  const targetGroup = requireTargetGroup(caseRow.groups, groupSlug);

  await prisma.group.update({
    where: { id: targetGroup.id },
    data: {
      isPublic,
    },
  });

  if (!isPublic && targetGroup.publicSlug) {
    await deletePublishedGroup(targetGroup.publicSlug);
  }
  if (!(await refreshPublishedCase(caseRow.id))) {
    await syncCasePublicationState(caseRow.id);
  }

  return {
    caseSlug: caseRow.slug,
    groupSlug: targetGroup.slug,
    isPublic,
  };
}

/**
 * Updates the workspace-facing case description and refreshes existing public manifests.
 */
export async function updateCaseSummary(caseSlug: string, summary: string) {
  const trimmedSummary = summary.trim();
  const caseRow = await prisma.case.update({
    where: { slug: caseSlug },
    data: { summary: trimmedSummary },
    select: {
      id: true,
      slug: true,
      summary: true,
    },
  });
  await refreshPublishedCase(caseRow.id);

  return {
    caseSlug: caseRow.slug,
    summary: caseRow.summary,
  };
}

/** Updates operator-managed Case metadata and refreshes existing public manifests. */
export async function updateCaseMetadata(
  caseSlug: string,
  metadata: { title?: string; summary?: string; tags?: string[] },
) {
  const data: { title?: string; summary?: string; tagsJson?: string } = {};

  if (metadata.title !== undefined) {
    const title = metadata.title.trim();
    if (!title) throw new BadRequestError("Case title is required.");
    data.title = title;
  }
  if (metadata.summary !== undefined) data.summary = metadata.summary.trim();
  if (metadata.tags !== undefined) {
    const tags = [...new Set(metadata.tags.map((tag) => tag.trim()).filter(Boolean))];
    data.tagsJson = JSON.stringify(tags);
  }
  if (Object.keys(data).length === 0) {
    throw new BadRequestError("No Case metadata to update.");
  }

  const existingCase = await prisma.case.findUnique({
    where: { slug: caseSlug },
    select: { id: true },
  });
  if (!existingCase) {
    throw new NotFoundError("Case not found.");
  }

  const caseRow = await prisma.case.update({
    where: { id: existingCase.id },
    data,
    select: { id: true, slug: true, title: true, summary: true, tagsJson: true, status: true },
  });
  await refreshPublishedCase(caseRow.id);

  return {
    caseSlug: caseRow.slug,
    title: caseRow.title,
    summary: caseRow.summary,
    tags: JSON.parse(caseRow.tagsJson) as string[],
    status: caseRow.status,
  };
}

/**
 * Updates group display metadata after resolving the group through its case, preserving slugs and
 * all publish/upload fields so existing viewer and public URLs remain stable.
 */
export async function updateGroupMetadata(
  caseSlug: string,
  groupSlug: string,
  metadata: { title: string; description: string },
) {
  const title = metadata.title.trim();
  const description = metadata.description.trim();

  if (!title) {
    throw new BadRequestError("Group title is required.");
  }

  const caseRow = await requireCaseWithGroups(caseSlug, {
    id: true,
    slug: true,
    isPublic: true,
  });
  const targetGroup = requireTargetGroup(caseRow.groups, groupSlug);
  const groupRow = await prisma.group.update({
    where: { id: targetGroup.id },
    data: {
      title,
      description,
    },
    select: {
      slug: true,
      title: true,
      description: true,
    },
  });

  if (targetGroup.isPublic) {
    await publishCase(caseRow.id);
  }

  return {
    caseSlug: caseRow.slug,
    groupSlug: groupRow.slug,
    title: groupRow.title,
    description: groupRow.description,
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
    throw new NotFoundError("Case not found.");
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
    throw new NotFoundError("Case not found.");
  }

  if (caseRow.groups.length > 0) {
    throw new ConflictError("Case must be empty before deletion.");
  }

  await prisma.case.delete({
    where: { id: caseRow.id },
  });

  return {
    caseSlug: caseRow.slug,
    deleted: true,
  };
}
