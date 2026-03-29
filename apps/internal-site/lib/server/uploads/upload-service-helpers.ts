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

/** Fields shared by every upload-job query so additions stay consistent. */
const baseJobFields = {
  id: true,
  inputHash: true,
  expectedFrameCount: true,
  committedFrameCount: true,
  status: true,
  expiresAt: true,
} as const;

const uploadJobSummarySelect = {
  ...baseJobFields,
  frameJobs: {
    select: { frameOrder: true, status: true },
    orderBy: { frameOrder: "asc" as const },
  },
} satisfies Prisma.GroupUploadJobSelect;

const uploadJobLifecycleSelect = {
  ...baseJobFields,
  case: { select: { id: true, slug: true } },
  group: { select: { id: true, slug: true, storageRoot: true } },
} satisfies Prisma.GroupUploadJobSelect;

const frameUploadJobSelect = {
  id: true,
  frameOrder: true,
  frameSnapshotJson: true,
  preparedAssetsJson: true,
  pendingPrefix: true,
  status: true,
  groupUploadJob: {
    select: uploadJobLifecycleSelect,
  },
} satisfies Prisma.FrameUploadJobSelect;

export type ActiveUploadJobSummary = Prisma.GroupUploadJobGetPayload<{
  select: typeof uploadJobSummarySelect;
}>;

export type ActiveUploadJob = Prisma.GroupUploadJobGetPayload<{
  select: typeof uploadJobLifecycleSelect;
}>;

export type ActiveFrameUploadJob = Prisma.FrameUploadJobGetPayload<{
  select: typeof frameUploadJobSelect;
}>;

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
 * Upload resets and visibility downgrades both mutate multiple rows before case-level derived
 * fields can be trusted again, so cover/publication refresh stays in one shared post-step.
 */
async function refreshCaseDerivedState(caseId: string): Promise<void> {
  await recomputeCaseCoverAsset(caseId);
  await syncCasePublicationState(caseId);
}

/**
 * Upload job expiry is enforced at read time so stale local resumptions stop behaving like valid
 * active jobs even before a later start flow cancels them in the database.
 */
function isExpiredUploadJob(
  expiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  return Boolean(expiresAt && expiresAt <= now);
}

/**
 * Centralizes the active-job guard so narrow summary queries and frame-level lookups reject the
 * same stale/cancelled job shapes without each caller re-implementing expiry semantics.
 */
function assertUploadJobIsActive(
  job:
    | {
        status: string;
        expiresAt: Date | null;
      }
    | null,
  now: Date = new Date(),
): asserts job is {
  status: string;
  expiresAt: Date | null;
} {
  if (!job || job.status !== ACTIVE_JOB_STATUS || isExpiredUploadJob(job.expiresAt, now)) {
    throw new Error("Upload job not found.");
  }
}

/**
 * Cancels old jobs before the partial unique index on active uploads is relied on, so pre-index
 * local databases and crash-leftovers converge to the same “one active job per group” invariant.
 */
async function cancelUploadJobs(jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) {
    return;
  }

  await prisma.$transaction([
    prisma.frameUploadJob.updateMany({
      where: {
        groupUploadJobId: {
          in: jobIds,
        },
      },
      data: {
        status: CANCELLED_JOB_STATUS,
      },
    }),
    prisma.groupUploadJob.updateMany({
      where: {
        id: {
          in: jobIds,
        },
      },
      data: {
        status: CANCELLED_JOB_STATUS,
      },
    }),
  ]);
}

/**
 * Start is the only step that can legitimately replace one active job with another, so expired
 * jobs are cancelled here before resume-or-reset decisions inspect current group state.
 */
export async function cancelExpiredActiveUploadJobs(
  groupId: string,
  now: Date = new Date(),
): Promise<void> {
  const expiredJobs = await prisma.groupUploadJob.findMany({
    where: {
      groupId,
      status: ACTIVE_JOB_STATUS,
      expiresAt: {
        not: null,
        lte: now,
      },
    },
    select: {
      id: true,
    },
  });

  await cancelUploadJobs(expiredJobs.map((job) => job.id));
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

  await refreshCaseDerivedState(params.caseId);
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
    frameStates: [...job.frameJobs].map((frameJob) => ({
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
 * Loads the newest still-active upload job summary for a group so start only touches the frame
 * states it needs for resume decisions instead of hydrating case/group payloads every time.
 */
export async function findActiveUploadJobByGroup(
  groupId: string,
  now: Date = new Date(),
): Promise<ActiveUploadJobSummary | null> {
  return prisma.groupUploadJob.findFirst({
    where: {
      groupId,
      status: ACTIVE_JOB_STATUS,
      OR: [
        {
          expiresAt: null,
        },
        {
          expiresAt: {
            gt: now,
          },
        },
      ],
    },
    select: uploadJobSummarySelect,
    orderBy: {
      updatedAt: "desc",
    },
  });
}

/**
 * Complete only needs job metadata and owning case/group ids, so this guard intentionally avoids
 * eager-loading every frame row the way the earlier broad include did.
 */
export async function requireActiveUploadJob(
  jobId: string,
  now: Date = new Date(),
): Promise<ActiveUploadJob> {
  const job = await prisma.groupUploadJob.findUnique({
    where: { id: jobId },
    select: uploadJobLifecycleSelect,
  });
  assertUploadJobIsActive(job, now);
  return job;
}

/**
 * Prepare and commit operate on exactly one frame, so they load that frame job directly by the
 * compound `(groupUploadJobId, frameOrder)` key instead of pulling the whole frameJobs array first.
 */
export async function requireActiveFrameUploadJob(
  groupUploadJobId: string,
  frameOrder: number,
  now: Date = new Date(),
): Promise<ActiveFrameUploadJob> {
  const frameJob = await prisma.frameUploadJob.findUnique({
    where: {
      groupUploadJobId_frameOrder: {
        groupUploadJobId,
        frameOrder,
      },
    },
    select: frameUploadJobSelect,
  });

  if (!frameJob) {
    throw new Error("Frame upload job not found.");
  }

  assertUploadJobIsActive(frameJob.groupUploadJob, now);
  return frameJob;
}

/**
 * Complete can trust the committed-frame counter fast path, but still needs a narrow count query
 * to reject jobs whose row-level states drifted away from the aggregate due to earlier failures.
 */
export async function countUncommittedFrameJobs(groupUploadJobId: string): Promise<number> {
  return prisma.frameUploadJob.count({
    where: {
      groupUploadJobId,
      status: {
        not: COMMITTED_FRAME_STATUS,
      },
    },
  });
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

  await refreshCaseDerivedState(job.case.id);
}
