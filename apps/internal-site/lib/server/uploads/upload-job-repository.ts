import { Prisma } from "@prisma/client";
import { NotFoundError } from "@/lib/server/api/errors";
import {
  recomputeCaseCoverAsset,
  syncCasePublicationState,
} from "@/lib/server/content/case-maintenance";
import { prisma } from "@/lib/server/db/client";

export const ACTIVE_JOB_STATUS = "active";
export const COMPLETED_JOB_STATUS = "completed";
export const CANCELLED_JOB_STATUS = "cancelled";
export const PENDING_FRAME_STATUS = "pending";
export const PREPARED_FRAME_STATUS = "prepared";
export const COMMITTED_FRAME_STATUS = "committed";
export const JOB_TTL_MS = 1000 * 60 * 60 * 24;

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
  snapshotJson: true,
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

/** Upload expiry is enforced while reading so stale resumptions cannot look active. */
function isExpiredUploadJob(expiresAt: Date | null, now: Date = new Date()): boolean {
  return Boolean(expiresAt && expiresAt <= now);
}

/** Keeps summary and frame-level lookups aligned on active-job semantics. */
function assertUploadJobIsActive(
  job: { status: string; expiresAt: Date | null } | null,
  now: Date = new Date(),
): asserts job is { status: string; expiresAt: Date | null } {
  if (!job || job.status !== ACTIVE_JOB_STATUS || isExpiredUploadJob(job.expiresAt, now)) {
    throw new NotFoundError("Upload job not found.");
  }
}

/** Cancels frame and group job rows atomically before another active upload is created. */
async function cancelUploadJobs(jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) {
    return;
  }

  await prisma.$transaction([
    prisma.frameUploadJob.updateMany({
      where: { groupUploadJobId: { in: jobIds } },
      data: { status: CANCELLED_JOB_STATUS },
    }),
    prisma.groupUploadJob.updateMany({
      where: { id: { in: jobIds } },
      data: { status: CANCELLED_JOB_STATUS },
    }),
  ]);
}

/** Cancels expired active jobs before start performs resume-or-reset decisions. */
export async function cancelExpiredActiveUploadJobs(
  groupId: string,
  now: Date = new Date(),
): Promise<void> {
  const expiredJobs = await prisma.groupUploadJob.findMany({
    where: {
      groupId,
      status: ACTIVE_JOB_STATUS,
      expiresAt: { not: null, lte: now },
    },
    select: { id: true },
  });

  await cancelUploadJobs(expiredJobs.map((job) => job.id));
}

/** Returns the resume-safe API summary without database ownership details. */
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
    canComplete: job.expectedFrameCount > 0 && job.expectedFrameCount === job.committedFrameCount,
    frameStates: job.frameJobs.map((frameJob) => ({
      frameOrder: frameJob.frameOrder,
      status: frameJob.status,
    })),
  };
}

/** Loads only the fields start needs to decide whether an active job can resume. */
export async function findActiveUploadJobByGroup(
  groupId: string,
  now: Date = new Date(),
): Promise<ActiveUploadJobSummary | null> {
  return prisma.groupUploadJob.findFirst({
    where: {
      groupId,
      status: ACTIVE_JOB_STATUS,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: uploadJobSummarySelect,
    orderBy: { updatedAt: "desc" },
  });
}

/** Loads lifecycle metadata for a still-active upload job. */
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

/** Loads one frame by its compound key and applies the same parent-job activity guard. */
export async function requireActiveFrameUploadJob(
  groupUploadJobId: string,
  frameOrder: number,
  now: Date = new Date(),
): Promise<ActiveFrameUploadJob> {
  const frameJob = await prisma.frameUploadJob.findUnique({
    where: { groupUploadJobId_frameOrder: { groupUploadJobId, frameOrder } },
    select: frameUploadJobSelect,
  });

  if (!frameJob) {
    throw new NotFoundError("Frame upload job not found.");
  }
  assertUploadJobIsActive(frameJob.groupUploadJob, now);
  return frameJob;
}

/** Verifies row-level frame state before the aggregate job is finalized. */
export async function countUncommittedFrameJobs(groupUploadJobId: string): Promise<number> {
  return prisma.frameUploadJob.count({
    where: { groupUploadJobId, status: { not: COMMITTED_FRAME_STATUS } },
  });
}

/** Finalizes the job and refreshes case fields that depend on the committed frame set. */
export async function markUploadJobCompleted(job: ActiveUploadJob): Promise<void> {
  await prisma.$transaction([
    prisma.groupUploadJob.update({
      where: { id: job.id },
      data: { status: COMPLETED_JOB_STATUS },
    }),
    prisma.group.update({
      where: { id: job.group.id },
      data: { lastUploadInputHash: job.inputHash },
    }),
  ]);

  await recomputeCaseCoverAsset(job.case.id);
  await syncCasePublicationState(job.case.id);
}
