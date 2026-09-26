import { prisma } from "@/lib/server/db/client";
import { BadRequestError, ConflictError, StorageValidationError } from "@/lib/server/api/errors";
import { deleteInternalAssetPrefix } from "@/lib/server/storage/internal-assets";
import {
  type GroupUploadStartInput,
  GroupUploadCancelInputSchema,
  GroupUploadCompleteInputSchema,
  GroupUploadFrameCommitInputSchema,
  GroupUploadFramePrepareInputSchema,
  GroupUploadStartInputSchema,
  type UploadFrameDescriptor,
  type UploadStreamFrameDescriptor,
  computeGroupUploadInputHash,
  isStreamUploadInput,
} from "./contracts";
import {
  ACTIVE_JOB_STATUS,
  CANCELLED_JOB_STATUS,
  COMMITTED_FRAME_STATUS,
  JOB_TTL_MS,
  PENDING_FRAME_STATUS,
  PREPARED_FRAME_STATUS,
  type ActiveFrameUploadJob,
  cancelExpiredActiveUploadJobs,
  countUncommittedFrameJobs,
  findActiveUploadJobByGroup,
  markUploadJobCompleted,
  parsePersistedJson,
  requireActiveFrameUploadJob,
  requireActiveUploadJob,
  summarizeUploadJob,
} from "./upload-job-repository";
import {
  clearGroupForRestart,
  downgradeGroupVisibility,
  ensureCaseAndGroup,
} from "./upload-group-lifecycle";
import {
  assertFrameCanCommit,
  assertFrameCanPrepare,
  buildFramePendingPrefix,
  buildPreparedUploadAssets,
  buildPresignedFiles,
  deleteReplacedFramePrefixes,
  type PreparedUploadAsset,
  validatePreparedAssetsAndGeneratePlaceholders,
} from "./upload-storage-operations";

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
 * Prepare is per-frame and idempotent for an unchanged descriptor. Reissuing PUT URLs must not
 * discard the already-uploaded revision because a later commit retry may be its recovery path.
 */
export async function prepareGroupUploadFrame(rawInput: unknown) {
  const input = GroupUploadFramePrepareInputSchema.parse(rawInput);
  const frameJob = await requireActiveFrameUploadJob(input.groupUploadJobId, input.frameOrder);
  assertFrameCanPrepare(frameJob);

  const rawJobSnapshot = parsePersistedJson<{ protocol?: unknown }>(
    frameJob.groupUploadJob.snapshotJson,
    "group upload snapshot",
  );
  const streamJobSnapshot =
    rawJobSnapshot?.protocol === "stream-v2"
      ? GroupUploadStartInputSchema.parse(rawJobSnapshot)
      : null;
  const streamInput =
    streamJobSnapshot && isStreamUploadInput(streamJobSnapshot) ? streamJobSnapshot : null;
  const streamSourceFrame = streamInput?.frames.find((frame) => frame.order === input.frameOrder);
  if (streamInput && !streamSourceFrame) {
    throw new Error("stream-v2 source frame was not found in the upload snapshot.");
  }
  const usesStreamingProtocol = Boolean(streamSourceFrame);
  const frameSnapshot = streamSourceFrame
    ? resolveStreamFrameSnapshot(streamSourceFrame, input.frame)
    : parsePersistedJson<UploadFrameDescriptor>(
        frameJob.frameSnapshotJson,
        "frame upload snapshot",
      );

  if (frameJob.status === PREPARED_FRAME_STATUS) {
    assertFrameCanCommit(frameJob);
    const persistedSnapshot = parsePersistedJson<UploadFrameDescriptor>(
      frameJob.frameSnapshotJson,
      "prepared frame upload snapshot",
    );
    if (!sameFrameDescriptor(persistedSnapshot, frameSnapshot)) {
      throw new ConflictError("Frame is already prepared with a different descriptor.");
    }
    const preparedAssets = parsePersistedJson<PreparedUploadAsset[]>(
      frameJob.preparedAssetsJson,
      "prepared upload assets",
    );
    const files = await buildPresignedFiles(preparedAssets);
    return {
      groupUploadJobId: frameJob.groupUploadJob.id,
      frameOrder: frameSnapshot.order,
      pendingPrefix: frameJob.pendingPrefix,
      files,
    };
  }

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
      ...(usesStreamingProtocol ? { frameSnapshotJson: JSON.stringify(frameSnapshot) } : {}),
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

/** Compares only the validated frame payload, independent of client asset ordering. */
function sameFrameDescriptor(left: UploadFrameDescriptor, right: UploadFrameDescriptor): boolean {
  if (left.order !== right.order || left.title !== right.title || left.caption !== right.caption) {
    return false;
  }
  if (left.assets.length !== right.assets.length) return false;

  const bySlot = (frame: UploadFrameDescriptor) =>
    [...frame.assets].sort((first, second) => first.slot.localeCompare(second.slot));
  const leftAssets = bySlot(left);
  const rightAssets = bySlot(right);
  return leftAssets.every((asset, index) => {
    const other = rightAssets[index];
    if (!other) return false;
    return (
      asset.slot === other.slot &&
      asset.kind === other.kind &&
      asset.label === other.label &&
      asset.note === other.note &&
      asset.width === other.width &&
      asset.height === other.height &&
      asset.isPrimaryDisplay === other.isPrimaryDisplay &&
      sameFileDescriptor(asset.original, other.original) &&
      sameFileDescriptor(asset.thumbnail, other.thumbnail)
    );
  });
}

function sameFileDescriptor(
  left: UploadFrameDescriptor["assets"][number]["original"],
  right: UploadFrameDescriptor["assets"][number]["original"],
): boolean {
  return (
    left.extension === right.extension &&
    left.contentType === right.contentType &&
    left.sha256.toLowerCase() === right.sha256.toLowerCase() &&
    left.size === right.size
  );
}

/**
 * Stream start persists the fully validated source manifest before any PUT. Prepare accepts the
 * generated thumbnail/heatmap descriptors later, but every original source and metadata field must
 * still match that immutable preflight snapshot.
 */
function resolveStreamFrameSnapshot(
  sourceFrame: UploadStreamFrameDescriptor,
  generatedFrame: UploadFrameDescriptor | undefined,
): UploadFrameDescriptor {
  if (!generatedFrame) {
    throw new BadRequestError("stream-v2 frame prepare requires a generated frame descriptor.");
  }
  if (
    generatedFrame.order !== sourceFrame.order ||
    generatedFrame.title !== sourceFrame.title ||
    generatedFrame.caption !== sourceFrame.caption
  ) {
    throw new BadRequestError(
      "Generated frame identity no longer matches the validated source manifest.",
    );
  }

  const sourceBySlot = new Map(sourceFrame.assets.map((asset) => [asset.slot, asset]));
  const generatedBySlot = new Map(generatedFrame.assets.map((asset) => [asset.slot, asset]));
  if (
    sourceBySlot.size !== sourceFrame.assets.length ||
    generatedBySlot.size !== generatedFrame.assets.length
  ) {
    throw new BadRequestError("Generated frame contains duplicate asset slots.");
  }
  for (const sourceAsset of sourceFrame.assets) {
    const generatedAsset = generatedBySlot.get(sourceAsset.slot);
    if (
      !generatedAsset ||
      generatedAsset.kind !== sourceAsset.kind ||
      generatedAsset.label !== sourceAsset.label ||
      generatedAsset.note !== sourceAsset.note ||
      generatedAsset.width !== sourceAsset.width ||
      generatedAsset.height !== sourceAsset.height ||
      generatedAsset.isPrimaryDisplay !== sourceAsset.isPrimaryDisplay ||
      !sameFileDescriptor(generatedAsset.original, sourceAsset.original)
    ) {
      throw new BadRequestError(
        `Generated asset ${sourceAsset.slot} no longer matches the preflight result.`,
      );
    }
  }

  const expectedSlots = new Set(sourceFrame.assets.map((asset) => asset.slot));
  if (sourceFrame.generatedHeatmap) {
    const heatmapPlan = sourceFrame.generatedHeatmap;
    const beforeSource = sourceBySlot.get(heatmapPlan.beforeSlot);
    const afterSource = sourceBySlot.get(heatmapPlan.afterSlot);
    const heatmap = generatedBySlot.get(heatmapPlan.slot);
    const before = generatedBySlot.get(heatmapPlan.beforeSlot);
    const after = generatedBySlot.get(heatmapPlan.afterSlot);
    if (
      expectedSlots.has(heatmapPlan.slot) ||
      heatmapPlan.beforeSlot === heatmapPlan.afterSlot ||
      !beforeSource ||
      beforeSource.kind !== "before" ||
      !afterSource ||
      (afterSource.kind !== "after" && afterSource.kind !== "misc") ||
      !heatmap ||
      !before ||
      !after ||
      heatmap.kind !== "heatmap" ||
      heatmap.width !== before.width ||
      heatmap.height !== before.height ||
      heatmap.width !== after.width ||
      heatmap.height !== after.height ||
      heatmap.isPrimaryDisplay
    ) {
      throw new BadRequestError(
        "Generated heatmap no longer matches the validated source manifest.",
      );
    }
    expectedSlots.add(heatmapPlan.slot);
  }
  if (
    generatedFrame.assets.length !== expectedSlots.size ||
    generatedFrame.assets.some((asset) => !expectedSlots.has(asset.slot))
  ) {
    throw new BadRequestError("Generated frame contains an unexpected asset set.");
  }

  return generatedFrame;
}

/**
 * Commit only flips one frame at a time. That keeps retries local to the failed frame while the
 * rest of the group can continue making forward progress.
 */
export async function commitGroupUploadFrame(rawInput: unknown) {
  const input = GroupUploadFrameCommitInputSchema.parse(rawInput);
  const frameJob = await requireActiveFrameUploadJob(input.groupUploadJobId, input.frameOrder);
  if (frameJob.status === COMMITTED_FRAME_STATUS) {
    return {
      groupUploadJobId: frameJob.groupUploadJob.id,
      frameOrder: frameJob.frameOrder,
      status: COMMITTED_FRAME_STATUS,
    };
  }

  const { frameSnapshot, job, pendingPrefix, preparedAssets } = loadPreparedFrameCommit(frameJob);
  let placeholderJson: Array<string | null>;
  try {
    placeholderJson = await validatePreparedAssetsAndGeneratePlaceholders(preparedAssets);
  } catch (error) {
    if (error instanceof StorageValidationError) {
      throw new StorageValidationError({
        ...error.diagnostic,
        groupUploadJobId: frameJob.groupUploadJob.id,
        frameOrder: frameJob.frameOrder,
        stage: "commit",
      });
    }
    throw error;
  }
  preparedAssets.forEach((asset, index) => {
    asset.imagePlaceholderJson = placeholderJson[index] ?? null;
  });
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
  const committed = await replaceCommittedFrame({
    existingFrames,
    frameJobId: frameJob.id,
    frameSnapshot,
    groupId: job.group.id,
    jobId: job.id,
    pendingPrefix,
    preparedAssets,
    caseId: job.case.id,
  });

  if (!committed) {
    const latestFrameJob = await requireActiveFrameUploadJob(
      input.groupUploadJobId,
      input.frameOrder,
    );
    if (latestFrameJob.status !== COMMITTED_FRAME_STATUS) {
      throw new ConflictError("Frame commit did not complete.");
    }

    return {
      groupUploadJobId: latestFrameJob.groupUploadJob.id,
      frameOrder: latestFrameJob.frameOrder,
      status: COMMITTED_FRAME_STATUS,
    };
  }

  await deleteReplacedFramePrefixes(existingFrames, pendingPrefix);

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
    throw new ConflictError("Not every frame in the upload job has been committed.");
  }

  await markUploadJobCompleted(job);

  return {
    groupUploadJobId: job.id,
    caseSlug: job.case.slug,
    groupSlug: job.group.slug,
    status: "completed" as const,
    committedFrameCount: job.committedFrameCount,
  };
}

/**
 * Abandon keeps committed group content intact but cancels the active import session and removes
 * prepared object prefixes so a later Web upload cannot resume from stale browser state.
 */
export async function cancelGroupUpload(rawInput: unknown) {
  const input = GroupUploadCancelInputSchema.parse(rawInput);
  const job = await requireActiveUploadJob(input.groupUploadJobId);
  const preparedFrameJobs = await prisma.frameUploadJob.findMany({
    where: {
      groupUploadJobId: job.id,
      status: {
        not: COMMITTED_FRAME_STATUS,
      },
    },
    select: {
      pendingPrefix: true,
    },
  });
  const pendingPrefixes = preparedFrameJobs
    .map((frameJob) => frameJob.pendingPrefix)
    .filter((prefix): prefix is string => Boolean(prefix));

  await prisma.$transaction([
    prisma.frameUploadJob.updateMany({
      where: {
        groupUploadJobId: job.id,
        status: {
          not: COMMITTED_FRAME_STATUS,
        },
      },
      data: {
        status: CANCELLED_JOB_STATUS,
      },
    }),
    prisma.groupUploadJob.update({
      where: { id: job.id },
      data: {
        status: CANCELLED_JOB_STATUS,
      },
    }),
  ]);

  for (const prefix of pendingPrefixes) {
    await deleteInternalAssetPrefix(prefix);
  }

  return {
    groupUploadJobId: job.id,
    status: CANCELLED_JOB_STATUS,
    deletedPendingPrefixCount: pendingPrefixes.length,
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
function loadPreparedFrameCommit(frameJob: ActiveFrameUploadJob) {
  assertFrameCanCommit(frameJob);

  return {
    job: frameJob.groupUploadJob,
    pendingPrefix: frameJob.pendingPrefix,
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
 * Claiming the prepared row, replacing content, and incrementing the aggregate count happen in one
 * transaction. A concurrent request that loses the conditional claim observes the committed row
 * afterward instead of creating a second Frame or advancing the counter twice.
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
}): Promise<boolean> {
  return prisma.$transaction(async (transaction) => {
    const claim = await transaction.frameUploadJob.updateMany({
      where: {
        id: params.frameJobId,
        status: PREPARED_FRAME_STATUS,
        groupUploadJob: { status: ACTIVE_JOB_STATUS },
      },
      data: {
        status: COMMITTED_FRAME_STATUS,
        committedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      return false;
    }

    await transaction.frame.deleteMany({
      where: {
        id: {
          in: params.existingFrames.map((frame) => frame.id),
        },
      },
    });
    await transaction.frame.create({
      data: buildCommittedFrameCreateInput(
        params.groupId,
        params.frameSnapshot,
        params.pendingPrefix,
        params.preparedAssets,
      ),
    });
    await transaction.case.update({
      where: { id: params.caseId },
      data: {
        coverAssetId: null,
      },
    });
    await transaction.groupUploadJob.update({
      where: { id: params.jobId },
      data: {
        committedFrameCount: {
          increment: 1,
        },
      },
    });

    return true;
  });
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
    committedFrameCount: params.resumableCommittedFrames ? params.input.frames.length : 0,
    expiresAt: new Date(Date.now() + JOB_TTL_MS),
    frameJobs: {
      create: params.input.frames.map((frame) => ({
        frameOrder: frame.order,
        frameSnapshotJson: JSON.stringify(frame),
        status: params.resumableCommittedFrames ? COMMITTED_FRAME_STATUS : PENDING_FRAME_STATUS,
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
  const storageValidatedAt = new Date();
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
        imagePlaceholderJson: asset.imagePlaceholderJson,
        width: asset.width,
        height: asset.height,
        note: asset.note,
        isPublic: true,
        isPrimaryDisplay: asset.isPrimaryDisplay,
        // Commit only reaches this transaction after every prepared object passed the storage
        // signature check, so later publishes can trust these immutable object paths.
        storageValidatedAt,
      })),
    },
  };
}
