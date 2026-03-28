import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db/client";
import {
  recomputeCaseCoverAsset,
  syncCasePublicationState,
} from "@/lib/server/content/case-maintenance";
import { stringifyTags } from "@/lib/server/content/mappers";
import { deletePublishedGroup } from "@/lib/server/storage/published-content";
import {
  buildLogicalStoragePath,
  createPresignedInternalAssetUpload,
  deleteInternalAssetPrefix,
} from "@/lib/server/storage/internal-assets";
import { assertLikelyImageAssetUrl } from "@/lib/server/storage/internal-asset-sanity";
import type {
  GroupUploadStartInput,
  UploadAssetDescriptor,
  UploadFrameDescriptor,
} from "./contracts";

export const ACTIVE_JOB_STATUS = "active";
export const COMPLETED_JOB_STATUS = "completed";
export const CANCELLED_JOB_STATUS = "cancelled";
export const PENDING_FRAME_STATUS = "pending";
export const PREPARED_FRAME_STATUS = "prepared";
export const COMMITTED_FRAME_STATUS = "committed";
export const JOB_TTL_MS = 1000 * 60 * 60 * 24;

export type PreparedUploadAsset = UploadAssetDescriptor & {
  original: UploadAssetDescriptor["original"] & { logicalPath: string };
  thumbnail: UploadAssetDescriptor["thumbnail"] & { logicalPath: string };
};

const uploadJobInclude = {
  case: true,
  group: true,
  frameJobs: true,
} satisfies Prisma.GroupUploadJobInclude;

export type ActiveUploadJob = Prisma.GroupUploadJobGetPayload<{
  include: typeof uploadJobInclude;
}>;
export type ActiveFrameUploadJob = ActiveUploadJob["frameJobs"][number];

/**
 * Fails with a domain-specific message when persisted JSON no longer matches the expected upload
 * snapshot shape, so operators see a useful error instead of a generic syntax exception.
 */
export function parsePersistedJson<T>(payload: string, label: string): T {
  try {
    return JSON.parse(payload) as T;
  } catch {
    throw new Error(`Failed to parse persisted ${label}.`);
  }
}

/**
 * Generates one opaque root per group so object keys never encode user-visible slugs.
 */
export function buildGroupStorageRoot(): string {
  return buildLogicalStoragePath("groups", randomUUID());
}

/**
 * Uses one-based frame folders because object listings are easier to scan when they match the
 * operator-facing frame order instead of the zero-based internal index.
 */
export function buildFramePendingPrefix(
  storageRoot: string,
  frameOrder: number,
): string {
  return `${storageRoot}/${frameOrder + 1}/${randomUUID()}`;
}

/**
 * Distinguishes managed group roots from tolerated legacy paths so rewrites can preserve new
 * opaque keys without accidentally promoting old slug-derived prefixes.
 */
export function isManagedGroupStorageRoot(storageRoot: string): boolean {
  return storageRoot.startsWith("/groups/");
}

/**
 * Once an upload job exists for a public group, that group is no longer publish-ready. We lower it
 * to internal immediately and drop the published bundle so viewers never see half-replaced frames.
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
    data: {
      isPublic: false,
    },
  });

  const remainingPublicGroups = await prisma.group.count({
    where: {
      caseId: params.caseId,
      isPublic: true,
    },
  });

  if (remainingPublicGroups === 0) {
    await prisma.case.update({
      where: { id: params.caseId },
      data: {
        coverAssetId: null,
      },
    });
    await syncCasePublicationState(params.caseId);
  }
}

/**
 * Input changes intentionally hard-reset the whole group so a restart cannot leave old committed
 * frames next to new pending ones or orphaned bucket objects under the same logical group.
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
      where: {
        groupUploadJob: {
          groupId: params.groupId,
          status: ACTIVE_JOB_STATUS,
        },
      },
      data: {
        status: CANCELLED_JOB_STATUS,
      },
    }),
    prisma.groupUploadJob.updateMany({
      where: {
        groupId: params.groupId,
        status: ACTIVE_JOB_STATUS,
      },
      data: {
        status: CANCELLED_JOB_STATUS,
      },
    }),
    prisma.frame.deleteMany({
      where: {
        groupId: params.groupId,
      },
    }),
    prisma.group.update({
      where: { id: params.groupId },
      data: {
        isPublic: false,
        lastUploadInputHash: null,
      },
    }),
    prisma.case.update({
      where: { id: params.caseId },
      data: {
        coverAssetId: null,
      },
    }),
  ]);

  if (params.publicSlug) {
    await deletePublishedGroup(params.publicSlug);
  }

  if (params.storageRoot) {
    await deleteInternalAssetPrefix(params.storageRoot);
  }

  const remainingPublicGroups = await prisma.group.count({
    where: {
      caseId: params.caseId,
      isPublic: true,
    },
  });
  if (remainingPublicGroups === 0) {
    await syncCasePublicationState(params.caseId);
  }
}

/**
 * Converts one frame snapshot into opaque original/thumbnail object keys so clients never decide
 * their own final bucket paths.
 */
export function buildPreparedUploadAssets(
  pendingPrefix: string,
  frame: UploadFrameDescriptor,
): PreparedUploadAsset[] {
  return [...frame.assets]
    .sort((left, right) => left.slot.localeCompare(right.slot))
    .map((asset, index) => ({
      ...asset,
      original: {
        ...asset.original,
        logicalPath: `${pendingPrefix}/o${index + 1}${asset.original.extension}`,
      },
      thumbnail: {
        ...asset.thumbnail,
        logicalPath: `${pendingPrefix}/t${index + 1}${asset.thumbnail.extension}`,
      },
    }));
}

/**
 * Signs one PUT URL per generated file so uploader workers can upload in parallel without needing
 * storage credentials or path-shaping logic locally.
 */
export async function buildPresignedFiles(preparedAssets: PreparedUploadAsset[]) {
  const files: Array<{
    slot: string;
    variant: "original" | "thumbnail";
    logicalPath: string;
    uploadUrl: string;
    expiresInSeconds: number;
    contentType: string;
  }> = [];

  for (const asset of preparedAssets) {
    for (const variant of ["original", "thumbnail"] as const) {
      const prepared = asset[variant];
      const signed = await createPresignedInternalAssetUpload({
        logicalPath: prepared.logicalPath,
        contentType: prepared.contentType,
      });
      files.push({
        slot: asset.slot,
        variant,
        logicalPath: prepared.logicalPath,
        uploadUrl: signed.uploadUrl,
        expiresInSeconds: signed.expiresInSeconds,
        contentType: prepared.contentType,
      });
    }
  }

  return files;
}

/**
 * Returns the resume-safe upload summary shape used by the API without leaking database-only
 * details such as group/case ids to the uploader.
 */
export function summarizeUploadJob(job: {
  id: string;
  inputHash: string;
  expectedFrameCount: number;
  committedFrameCount: number;
  frameJobs: Array<{ frameOrder: number; status: string }>;
}) {
  return {
    groupUploadJobId: job.id,
    inputHash: job.inputHash,
    expectedFrameCount: job.expectedFrameCount,
    committedFrameCount: job.committedFrameCount,
    canComplete:
      job.expectedFrameCount > 0 &&
      job.expectedFrameCount === job.committedFrameCount,
    frameStates: [...job.frameJobs]
      .sort((left, right) => left.frameOrder - right.frameOrder)
      .map((frameJob) => ({
        frameOrder: frameJob.frameOrder,
        status: frameJob.status,
      })),
  };
}

/**
 * Existing cases remain authoritative in the database because the uploader has no case-edit API.
 * New cases are still created from uploader metadata so first import stays one command.
 */
export async function ensureCaseAndGroup(input: GroupUploadStartInput) {
  const existingCase = await prisma.case.findUnique({
    where: { slug: input.case.slug },
  });

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
    where: {
      caseId_slug: {
        caseId: caseRow.id,
        slug: input.group.slug,
      },
    },
    include: {
      _count: {
        select: {
          frames: true,
        },
      },
    },
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
      include: {
        _count: {
          select: {
            frames: true,
          },
        },
      },
    }));

  if (groupRow.id !== (existingGroup?.id ?? groupRow.id)) {
    throw new Error("Unexpected group identity mismatch.");
  }

  if (
    existingGroup &&
    (existingGroup.storageRoot !== storageRoot ||
      existingGroup.title !== input.group.title ||
      existingGroup.description !== input.group.description ||
      existingGroup.order !== input.group.order ||
      existingGroup.defaultMode !== input.group.defaultMode ||
      existingGroup.tagsJson !== stringifyTags(input.group.tags))
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
          tagsJson: stringifyTags(input.group.tags),
          storageRoot,
        },
        include: {
          _count: {
            select: {
              frames: true,
            },
          },
        },
      }),
    };
  }

  return {
    caseRow,
    groupRow,
  };
}

/**
 * Loads the newest active job for one group so restart/resume decisions stay centralized instead of
 * being reimplemented in each API step.
 */
export async function findActiveUploadJobByGroup(groupId: string) {
  return prisma.groupUploadJob.findFirst({
    where: {
      groupId,
      status: ACTIVE_JOB_STATUS,
    },
    include: uploadJobInclude,
    orderBy: {
      updatedAt: "desc",
    },
  });
}

/**
 * Ensures every upload step operates on a still-active job with the same eager relations, so later
 * helpers do not each need to repeat the same missing-job and status checks.
 */
export async function requireActiveUploadJob(jobId: string): Promise<ActiveUploadJob> {
  const job = await prisma.groupUploadJob.findUnique({
    where: { id: jobId },
    include: uploadJobInclude,
  });

  if (!job || job.status !== ACTIVE_JOB_STATUS) {
    throw new Error("Upload job not found.");
  }

  return job;
}

/**
 * Resolves one frame sub-job by its persisted order value so prepare/commit cannot accidentally
 * diverge on whether they index frames by array position or business order.
 */
export function requireUploadFrameJob(
  frameJobs: ActiveUploadJob["frameJobs"],
  frameOrder: number,
): ActiveFrameUploadJob {
  const frameJob = frameJobs.find((item) => item.frameOrder === frameOrder);

  if (!frameJob) {
    throw new Error("Frame upload job not found.");
  }

  return frameJob;
}

/**
 * Fails before signing any URLs when the requested frame is already committed, because prepare is
 * only valid for pending or previously prepared frames.
 */
export function assertFrameCanPrepare(frameJob: ActiveFrameUploadJob): void {
  if (frameJob.status === COMMITTED_FRAME_STATUS) {
    throw new Error("Frame is already committed.");
  }
}

/**
 * Ensures commit only runs for a frame that has a prepared revision prefix and persisted upload
 * manifest, otherwise commit could promote a partially initialized frame.
 */
export function assertFrameCanCommit(
  frameJob: ActiveFrameUploadJob,
): asserts frameJob is ActiveFrameUploadJob & {
  pendingPrefix: string;
  preparedAssetsJson: string;
} {
  if (
    frameJob.status !== PREPARED_FRAME_STATUS ||
    !frameJob.pendingPrefix ||
    !frameJob.preparedAssetsJson
  ) {
    throw new Error("Frame is not ready to commit.");
  }
}

/**
 * Validates that every uploaded object now looks like a real image before the database starts
 * pointing at the new revision.
 */
export async function assertPreparedAssetsUploaded(
  preparedAssets: PreparedUploadAsset[],
): Promise<void> {
  for (const asset of preparedAssets) {
    for (const variant of ["original", "thumbnail"] as const) {
      await assertLikelyImageAssetUrl(asset[variant].logicalPath);
    }
  }
}

/**
 * Removes old frame prefixes only after the new frame row committed successfully, so object-store
 * cleanup cannot strand the group without any committed revision.
 */
export async function deleteReplacedFramePrefixes(
  frames: Array<{ storagePrefix: string | null }>,
  committedPrefix: string,
): Promise<void> {
  for (const frame of frames) {
    if (frame.storagePrefix && frame.storagePrefix !== committedPrefix) {
      await deleteInternalAssetPrefix(frame.storagePrefix);
    }
  }
}

/**
 * Finalizes one completed upload job and refreshes the case-level derived fields that depend on
 * the now-authoritative frame set.
 */
export async function markUploadJobCompleted(job: ActiveUploadJob): Promise<void> {
  await prisma.$transaction([
    prisma.groupUploadJob.update({
      where: { id: job.id },
      data: {
        status: COMPLETED_JOB_STATUS,
      },
    }),
    prisma.group.update({
      where: { id: job.group.id },
      data: {
        lastUploadInputHash: job.inputHash,
      },
    }),
  ]);

  await recomputeCaseCoverAsset(job.case.id);
  await syncCasePublicationState(job.case.id);
}
