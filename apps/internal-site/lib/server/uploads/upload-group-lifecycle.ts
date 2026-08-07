import { randomUUID } from "node:crypto";
import {
  recomputeCaseCoverAsset,
  syncCasePublicationState,
} from "@/lib/server/content/case-maintenance";
import { stringifyTags } from "@/lib/server/content/mappers";
import { prisma } from "@/lib/server/db/client";
import {
  deleteInternalAssetPrefix,
  buildLogicalStoragePath,
} from "@/lib/server/storage/internal-assets";
import { deletePublishedGroup } from "@/lib/server/storage/published-content";
import type { GroupUploadStartInput } from "./contracts";
import { ACTIVE_JOB_STATUS, CANCELLED_JOB_STATUS } from "./upload-job-repository";

/** Generates one opaque root per group so object keys never encode user-visible slugs. */
function buildGroupStorageRoot(): string {
  return buildLogicalStoragePath("groups", randomUUID());
}

/** Separates current opaque roots from tolerated legacy slug-derived storage paths. */
function isManagedGroupStorageRoot(storageRoot: string): boolean {
  return storageRoot.startsWith("/groups/");
}

/** Upload resets affect both cover selection and case publication state. */
async function refreshCaseDerivedState(caseId: string): Promise<void> {
  await recomputeCaseCoverAsset(caseId);
  await syncCasePublicationState(caseId);
}

/**
 * Once an upload starts for a public group, hide its old bundle before frames can become a mixed
 * old/new set.
 */
export async function downgradeGroupVisibility(params: {
  caseId: string;
  groupId: string;
  publicSlug: string | null;
  wasPublic: boolean;
}): Promise<void> {
  if (!params.wasPublic) {
    return;
  }

  if (params.publicSlug) {
    await deletePublishedGroup(params.publicSlug);
  }
  await prisma.group.update({
    where: { id: params.groupId },
    data: { isPublic: false },
  });
  await refreshCaseDerivedState(params.caseId);
}

/**
 * Input changes hard-reset the group so old committed frames and object prefixes cannot coexist
 * with a new upload snapshot.
 */
export async function clearGroupForRestart(params: {
  caseId: string;
  groupId: string;
  storageRoot: string;
  publicSlug: string | null;
  wasPublic: boolean;
}): Promise<void> {
  await prisma.$transaction([
    prisma.frameUploadJob.updateMany({
      where: { groupUploadJob: { groupId: params.groupId, status: ACTIVE_JOB_STATUS } },
      data: { status: CANCELLED_JOB_STATUS },
    }),
    prisma.groupUploadJob.updateMany({
      where: { groupId: params.groupId, status: ACTIVE_JOB_STATUS },
      data: { status: CANCELLED_JOB_STATUS },
    }),
    prisma.frame.deleteMany({ where: { groupId: params.groupId } }),
    prisma.group.update({
      where: { id: params.groupId },
      data: { isPublic: false, lastUploadInputHash: null },
    }),
  ]);

  if (params.publicSlug) {
    await deletePublishedGroup(params.publicSlug);
  }
  if (params.storageRoot) {
    await deleteInternalAssetPrefix(params.storageRoot);
  }
  await refreshCaseDerivedState(params.caseId);
}

/**
 * Existing cases remain authoritative; group presentation metadata is refreshed because upload is
 * its supported write path.
 */
export async function ensureCaseAndGroup(input: GroupUploadStartInput) {
  const existingCase = await prisma.case.findUnique({ where: { slug: input.case.slug } });
  const caseRow =
    existingCase ??
    (await prisma.case.create({
      data: {
        slug: input.case.slug,
        title: input.case.title,
        subtitle: "",
        summary: input.case.summary,
        tagsJson: stringifyTags(input.case.tags),
        status: "internal",
        coverAssetId: null,
      },
    }));

  const existingGroup = await prisma.group.findUnique({
    where: { caseId_slug: { caseId: caseRow.id, slug: input.group.slug } },
    include: { _count: { select: { frames: true } } },
  });
  const storageRoot =
    existingGroup && isManagedGroupStorageRoot(existingGroup.storageRoot)
      ? existingGroup.storageRoot
      : buildGroupStorageRoot();
  const groupRow =
    existingGroup ??
    (await prisma.group.create({
      data: {
        caseId: caseRow.id,
        slug: input.group.slug,
        title: input.group.title,
        description: input.group.description,
        order: input.group.order,
        defaultMode: input.group.defaultMode,
        isPublic: false,
        tagsJson: stringifyTags(input.group.tags),
        storageRoot,
        lastUploadInputHash: null,
      },
      include: { _count: { select: { frames: true } } },
    }));

  const tagsJson = stringifyTags(input.group.tags);
  if (
    existingGroup &&
    (existingGroup.storageRoot !== storageRoot ||
      existingGroup.title !== input.group.title ||
      existingGroup.description !== input.group.description ||
      existingGroup.order !== input.group.order ||
      existingGroup.defaultMode !== input.group.defaultMode ||
      existingGroup.tagsJson !== tagsJson)
  ) {
    return {
      caseRow,
      groupRow: await prisma.group.update({
        where: { id: existingGroup.id },
        data: {
          title: input.group.title,
          description: input.group.description,
          order: input.group.order,
          defaultMode: input.group.defaultMode,
          tagsJson,
          storageRoot,
        },
        include: { _count: { select: { frames: true } } },
      }),
    };
  }

  return { caseRow, groupRow };
}
