import { prisma } from "@/lib/server/db/client";
import { deleteInternalAssetPrefix } from "@/lib/server/storage/internal-assets";
import {
  type GroupUploadStartInput,
  GroupUploadCompleteInputSchema,
  GroupUploadFrameCommitInputSchema,
  GroupUploadFramePrepareInputSchema,
  GroupUploadStartInputSchema,
  type UploadFrameDescriptor,
  computeGroupUploadInputHash,
} from "./contracts";
import {
  ACTIVE_JOB_STATUS,
  COMMITTED_FRAME_STATUS,
  JOB_TTL_MS,
  PENDING_FRAME_STATUS,
  PREPARED_FRAME_STATUS,
  assertFrameCanCommit,
  assertFrameCanPrepare,
  assertPreparedAssetsUploaded,
  buildFramePendingPrefix,
  buildPreparedUploadAssets,
  buildPresignedFiles,
  cancelExpiredActiveUploadJobs,
  countUncommittedFrameJobs,
  clearGroupForRestart,
  deleteReplacedFramePrefixes,
  downgradeGroupVisibility,
  ensureCaseAndGroup,
  findActiveUploadJobByGroup,
  markUploadJobCompleted,
  parsePersistedJson,
  requireActiveUploadJob,
  requireActiveFrameUploadJob,
  summarizeUploadJob,
  type PreparedUploadAsset,
} from "./upload-service-helpers";

/**
 * Start either resumes the current active job, converts a matching completed upload into an
 * already-committed active job, or wipes the group and creates a fresh active job.
 */
export async function startGroupUpload(rawInput: unknown) {
  const input = GroupUploadStartInputSchema.parse(rawInput);
  const inputHash = computeGroupUploadInputHash(input);
  const { caseRow, groupRow } = await ensureCaseAndGroup(input);
  await cancelExpiredActiveUploadJobs(groupRow.id);
  const activeJob = await findActiveUploadJobByGroup(groupRow.id);

  if (activeJob && canResumeUploadJob(activeJob, inputHash, input)) {
    return summarizeUploadJob(activeJob);
  }
  const shouldClearExistingGroup = await resetGroupBeforeUploadStart({
    activeJob,
    caseId: caseRow.id,
    groupRow,
    input,
    inputHash,
  });

  const resumableCommittedFrames = canReuseCommittedFrames({
    expectedFrameCount: input.frames.length,
    inputHash,
    lastUploadInputHash: groupRow.lastUploadInputHash,
    shouldClearExistingGroup,
    storedFrameCount: groupRow._count.frames,
  });

  const job = await prisma.groupUploadJob.create({
    data: buildUploadJobCreateInput({
      caseId: caseRow.id,
      groupId: groupRow.id,
      input,
      inputHash,
      resumableCommittedFrames,
    }),
    include: {
      frameJobs: true,
    },
  });

  return summarizeUploadJob(job);
}

/**
 * Prepare is per-frame so interrupted group uploads only need to discard the in-flight frame
 * revision instead of reissuing URLs for the whole group.
 */
export async function prepareGroupUploadFrame(rawInput: unknown) {
  const input = GroupUploadFramePrepareInputSchema.parse(rawInput);
  const frameJob = await requireActiveFrameUploadJob(
    input.groupUploadJobId,
    input.frameOrder,
  );
  assertFrameCanPrepare(frameJob);

  if (frameJob.pendingPrefix) {
    await deleteInternalAssetPrefix(frameJob.pendingPrefix);
  }

  const frameSnapshot = parsePersistedJson<UploadFrameDescriptor>(
    frameJob.frameSnapshotJson,
    "frame upload snapshot",
  );
  const pendingPrefix = buildFramePendingPrefix(
    frameJob.groupUploadJob.group.storageRoot,
    frameSnapshot.order,
  );
  const preparedAssets = buildPreparedUploadAssets(pendingPrefix, frameSnapshot);
  const files = await buildPresignedFiles(preparedAssets);

  await prisma.frameUploadJob.update({
    where: { id: frameJob.id },
    data: {
      pendingPrefix,
      preparedAssetsJson: JSON.stringify(preparedAssets),
      status: PREPARED_FRAME_STATUS,
    },
  });

  return {
    groupUploadJobId: frameJob.groupUploadJob.id,
    frameOrder: frameSnapshot.order,
    pendingPrefix,
    files,
  };
}

/**
 * Commit only flips one frame at a time. That keeps retries local to the failed frame while the
 * rest of the group can continue making forward progress.
 */
export async function commitGroupUploadFrame(rawInput: unknown) {
  const input = GroupUploadFrameCommitInputSchema.parse(rawInput);
  const { frameJob, frameSnapshot, job, preparedAssets } =
    await loadPreparedFrameCommit(input.groupUploadJobId, input.frameOrder);
  await assertPreparedAssetsUploaded(preparedAssets);
  const existingFrames = await prisma.frame.findMany({
    where: {
      groupId: job.group.id,
      order: frameSnapshot.order,
    },
    select: {
      id: true,
      storagePrefix: true,
    },
  });
  await replaceCommittedFrame({
    existingFrames,
    frameJobId: frameJob.id,
    frameSnapshot,
    groupId: job.group.id,
    jobId: job.id,
    pendingPrefix: frameJob.pendingPrefix,
    preparedAssets,
    caseId: job.case.id,
  });

  await deleteReplacedFramePrefixes(existingFrames, frameJob.pendingPrefix);

  return {
    groupUploadJobId: job.id,
    frameOrder: frameSnapshot.order,
    status: COMMITTED_FRAME_STATUS,
  };
}

/**
 * Complete only succeeds when the whole frame set is committed. This keeps group-level cleanup and
 * cover recalculation in one explicit phase while frame commits stay small and retryable.
 */
export async function completeGroupUpload(rawInput: unknown) {
  const input = GroupUploadCompleteInputSchema.parse(rawInput);
  const job = await requireActiveUploadJob(input.groupUploadJobId);

  if (
    job.expectedFrameCount !== job.committedFrameCount ||
    (await countUncommittedFrameJobs(job.id)) > 0
  ) {
    throw new Error("Not every frame in the upload job has been committed.");
  }

  await markUploadJobCompleted(job);

  return {
    groupUploadJobId: job.id,
    caseSlug: job.case.slug,
    groupSlug: job.group.slug,
    committedFrameCount: job.committedFrameCount,
  };
}

/**
 * Restart decisions depend on both remote job state and the last committed input hash, so the
 * boolean stays centralized instead of being rederived inline by the start handler.
 */
function shouldClearExistingGroupState(params: {
  activeJobExists: boolean;
  frameCount: number;
  forceRestart: boolean;
  lastUploadInputHash: string | null;
  inputHash: string;
}): boolean {
  return (
    params.activeJobExists ||
    params.forceRestart ||
    (params.frameCount > 0 && params.lastUploadInputHash !== params.inputHash)
  );
}

/**
 * Already-committed frames are reusable only when the stored frame set matches the new input
 * exactly and the start flow did not need to reset the group first.
 */
function canReuseCommittedFrames(params: {
  expectedFrameCount: number;
  inputHash: string;
  lastUploadInputHash: string | null;
  shouldClearExistingGroup: boolean;
  storedFrameCount: number;
}): boolean {
  return (
    !params.shouldClearExistingGroup &&
    params.storedFrameCount === params.expectedFrameCount &&
    params.lastUploadInputHash === params.inputHash
  );
}

/**
 * Upload start first resolves resume-versus-reset state, then applies visibility downgrade and
 * destructive cleanup in that order so public content disappears before any group data is cleared.
 */
function canResumeUploadJob(
  activeJob: Awaited<ReturnType<typeof findActiveUploadJobByGroup>>,
  inputHash: string,
  input: GroupUploadStartInput,
) {
  if (activeJob && activeJob.inputHash === inputHash && !input.forceRestart) {
    return true;
  }

  return false;
}

/**
 * Reset logic is isolated so destructive cleanup stays in one place and startGroupUpload can read
 * as “resume if possible, otherwise reset if required, then create a new job.”
 */
async function resetGroupBeforeUploadStart(params: {
  activeJob: Awaited<ReturnType<typeof findActiveUploadJobByGroup>>;
  caseId: string;
  groupRow: Awaited<ReturnType<typeof ensureCaseAndGroup>>["groupRow"];
  input: GroupUploadStartInput;
  inputHash: string;
}) {
  if (params.groupRow.isPublic) {
    await downgradeGroupVisibility({
      caseId: params.caseId,
      groupId: params.groupRow.id,
      publicSlug: params.groupRow.publicSlug,
      wasPublic: params.groupRow.isPublic,
    });
  }

  const shouldClearExistingGroup = shouldClearExistingGroupState({
    activeJobExists: Boolean(params.activeJob),
    frameCount: params.groupRow._count.frames,
    forceRestart: params.input.forceRestart,
    lastUploadInputHash: params.groupRow.lastUploadInputHash,
    inputHash: params.inputHash,
  });

  if (shouldClearExistingGroup) {
    await clearGroupForRestart({
      caseId: params.caseId,
      groupId: params.groupRow.id,
      storageRoot: params.groupRow.storageRoot,
      publicSlug: params.groupRow.publicSlug,
      wasPublic: params.groupRow.isPublic,
    });
  }

  return shouldClearExistingGroup;
}

/**
 * Commit loads one frame's persisted snapshot and prepared asset manifest from the active job so
 * later mutation code can stay focused on replacing rows instead of re-validating state.
 */
async function loadPreparedFrameCommit(groupUploadJobId: string, frameOrder: number) {
  const frameJob = await requireActiveFrameUploadJob(groupUploadJobId, frameOrder);
  assertFrameCanCommit(frameJob);

  return {
    job: frameJob.groupUploadJob,
    frameJob,
    frameSnapshot: parsePersistedJson<UploadFrameDescriptor>(
      frameJob.frameSnapshotJson,
      "frame upload snapshot",
    ),
    preparedAssets: parsePersistedJson<PreparedUploadAsset[]>(
      frameJob.preparedAssetsJson,
      "prepared upload assets",
    ),
  };
}

/**
 * Row replacement happens in one transaction so a frame never points at mixed old/new assets and
 * the group's committed-frame counter only advances if the replacement row landed successfully.
 */
async function replaceCommittedFrame(params: {
  caseId: string;
  existingFrames: Array<{ id: string }>;
  frameJobId: string;
  frameSnapshot: UploadFrameDescriptor;
  groupId: string;
  jobId: string;
  pendingPrefix: string;
  preparedAssets: PreparedUploadAsset[];
}) {
  await prisma.$transaction([
    prisma.frame.deleteMany({
      where: {
        id: {
          in: params.existingFrames.map((frame) => frame.id),
        },
      },
    }),
    prisma.frame.create({
      data: buildCommittedFrameCreateInput(
        params.groupId,
        params.frameSnapshot,
        params.pendingPrefix,
        params.preparedAssets,
      ),
    }),
    prisma.case.update({
      where: { id: params.caseId },
      data: {
        coverAssetId: null,
      },
    }),
    prisma.frameUploadJob.update({
      where: { id: params.frameJobId },
      data: {
        status: COMMITTED_FRAME_STATUS,
        committedAt: new Date(),
      },
    }),
    prisma.groupUploadJob.update({
      where: { id: params.jobId },
      data: {
        committedFrameCount: {
          increment: 1,
        },
      },
    }),
  ]);
}

/**
 * Keeps job creation payload assembly in one place so status, expiry, and per-frame snapshot
 * defaults stay aligned across future upload-flow changes.
 */
function buildUploadJobCreateInput(params: {
  caseId: string;
  groupId: string;
  input: GroupUploadStartInput;
  inputHash: string;
  resumableCommittedFrames: boolean;
}) {
  return {
    caseId: params.caseId,
    groupId: params.groupId,
    inputHash: params.inputHash,
    snapshotJson: JSON.stringify(params.input),
    status: ACTIVE_JOB_STATUS,
    expectedFrameCount: params.input.frames.length,
    committedFrameCount: params.resumableCommittedFrames
      ? params.input.frames.length
      : 0,
    expiresAt: new Date(Date.now() + JOB_TTL_MS),
    frameJobs: {
      create: params.input.frames.map((frame) => ({
        frameOrder: frame.order,
        frameSnapshotJson: JSON.stringify(frame),
        status: params.resumableCommittedFrames
          ? COMMITTED_FRAME_STATUS
          : PENDING_FRAME_STATUS,
      })),
    },
  };
}

/**
 * Creates the committed frame row from the prepared upload snapshot so the transaction body stays
 * focused on ordering rather than object-shape construction.
 */
function buildCommittedFrameCreateInput(
  groupId: string,
  frameSnapshot: UploadFrameDescriptor,
  pendingPrefix: string,
  preparedAssets: PreparedUploadAsset[],
) {
  return {
    groupId,
    title: frameSnapshot.title,
    caption: frameSnapshot.caption,
    order: frameSnapshot.order,
    isPublic: true,
    storagePrefix: pendingPrefix,
    assets: {
      create: preparedAssets.map((asset) => ({
        kind: asset.kind,
        label: asset.label,
        imageUrl: asset.original.logicalPath,
        thumbUrl: asset.thumbnail.logicalPath,
        width: asset.width,
        height: asset.height,
        note: asset.note,
        isPublic: true,
        isPrimaryDisplay: asset.isPrimaryDisplay,
      })),
    },
  };
}
