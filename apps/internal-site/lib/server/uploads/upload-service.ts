import { randomUUID } from "node:crypto";
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
import {
  type GroupUploadStartInput,
  GroupUploadStartInputSchema,
  GroupUploadFrameCommitInputSchema,
  GroupUploadFramePrepareInputSchema,
  GroupUploadCompleteInputSchema,
  computeGroupUploadInputHash,
  type UploadAssetDescriptor,
  type UploadFrameDescriptor,
} from "./contracts";

const ACTIVE_JOB_STATUS = "active";
const COMPLETED_JOB_STATUS = "completed";
const CANCELLED_JOB_STATUS = "cancelled";
const PENDING_FRAME_STATUS = "pending";
const PREPARED_FRAME_STATUS = "prepared";
const COMMITTED_FRAME_STATUS = "committed";
const JOB_TTL_MS = 1000 * 60 * 60 * 24;

type PreparedUploadAsset = UploadAssetDescriptor & {
  original: UploadAssetDescriptor["original"] & { logicalPath: string };
  thumbnail: UploadAssetDescriptor["thumbnail"] & { logicalPath: string };
};

function parseJson<T>(payload: string, label: string): T {
  try {
    return JSON.parse(payload) as T;
  } catch {
    throw new Error(`Failed to parse persisted ${label}.`);
  }
}

function buildGroupStorageRoot(): string {
  return buildLogicalStoragePath("groups", randomUUID());
}

function buildFramePendingPrefix(storageRoot: string, frameOrder: number): string {
  return `${storageRoot}/${frameOrder + 1}/${randomUUID()}`;
}

function isManagedGroupStorageRoot(storageRoot: string): boolean {
  return storageRoot.startsWith("/groups/");
}

/**
 * Once an upload job exists for a public group, that group is no longer publish-ready. We lower it
 * to internal immediately and drop the published bundle so viewers never see half-replaced frames.
 */
async function downgradeGroupVisibility(params: {
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
async function clearGroupForRestart(params: {
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

function buildPreparedUploadAssets(
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

async function buildPresignedFiles(preparedAssets: PreparedUploadAsset[]) {
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

function summarizeJob(job: {
  id: string;
  inputHash: string;
  caseId: string;
  groupId: string;
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
async function ensureCaseAndGroup(input: GroupUploadStartInput) {
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
 * Start either resumes the current active job, converts a matching completed upload into an
 * already-committed active job, or wipes the group and creates a fresh active job.
 */
export async function startGroupUpload(rawInput: unknown) {
  const input = GroupUploadStartInputSchema.parse(rawInput);
  const inputHash = computeGroupUploadInputHash(input);
  const { caseRow, groupRow } = await ensureCaseAndGroup(input);
  const activeJob = await prisma.groupUploadJob.findFirst({
    where: {
      groupId: groupRow.id,
      status: ACTIVE_JOB_STATUS,
    },
    include: {
      frameJobs: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (activeJob && activeJob.inputHash === inputHash && !input.forceRestart) {
    return summarizeJob(activeJob);
  }

  if (groupRow.isPublic) {
    await downgradeGroupVisibility({
      caseId: caseRow.id,
      groupId: groupRow.id,
      publicSlug: groupRow.publicSlug,
      wasPublic: groupRow.isPublic,
    });
  }

  const shouldClearExistingGroup =
    Boolean(activeJob) ||
    input.forceRestart ||
    (groupRow._count.frames > 0 && groupRow.lastUploadInputHash !== inputHash);

  if (shouldClearExistingGroup) {
    await clearGroupForRestart({
      caseId: caseRow.id,
      groupId: groupRow.id,
      storageRoot: groupRow.storageRoot,
      publicSlug: groupRow.publicSlug,
      wasPublic: groupRow.isPublic,
    });
  }

  const resumableCommittedFrames =
    !shouldClearExistingGroup &&
    groupRow._count.frames === input.frames.length &&
    groupRow.lastUploadInputHash === inputHash;

  const job = await prisma.groupUploadJob.create({
    data: {
      caseId: caseRow.id,
      groupId: groupRow.id,
      inputHash,
      snapshotJson: JSON.stringify(input),
      status: ACTIVE_JOB_STATUS,
      expectedFrameCount: input.frames.length,
      committedFrameCount: resumableCommittedFrames ? input.frames.length : 0,
      expiresAt: new Date(Date.now() + JOB_TTL_MS),
      frameJobs: {
        create: input.frames.map((frame) => ({
          frameOrder: frame.order,
          frameSnapshotJson: JSON.stringify(frame),
          status: resumableCommittedFrames ? COMMITTED_FRAME_STATUS : PENDING_FRAME_STATUS,
        })),
      },
    },
    include: {
      frameJobs: true,
    },
  });

  return summarizeJob(job);
}

/**
 * Prepare is per-frame so interrupted group uploads only need to discard the in-flight frame
 * revision instead of reissuing URLs for the whole group.
 */
export async function prepareGroupUploadFrame(rawInput: unknown) {
  const input = GroupUploadFramePrepareInputSchema.parse(rawInput);
  const job = await prisma.groupUploadJob.findUnique({
    where: { id: input.groupUploadJobId },
    include: {
      group: true,
      frameJobs: true,
    },
  });

  if (!job || job.status !== ACTIVE_JOB_STATUS) {
    throw new Error("Upload job not found.");
  }

  const frameJob = job.frameJobs.find((item) => item.frameOrder === input.frameOrder);
  if (!frameJob) {
    throw new Error("Frame upload job not found.");
  }
  if (frameJob.status === COMMITTED_FRAME_STATUS) {
    throw new Error("Frame is already committed.");
  }

  if (frameJob.pendingPrefix) {
    await deleteInternalAssetPrefix(frameJob.pendingPrefix);
  }

  const frameSnapshot = parseJson<UploadFrameDescriptor>(
    frameJob.frameSnapshotJson,
    "frame upload snapshot",
  );
  const pendingPrefix = buildFramePendingPrefix(job.group.storageRoot, frameSnapshot.order);
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
    groupUploadJobId: job.id,
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
  const job = await prisma.groupUploadJob.findUnique({
    where: { id: input.groupUploadJobId },
    include: {
      case: true,
      group: true,
      frameJobs: true,
    },
  });

  if (!job || job.status !== ACTIVE_JOB_STATUS) {
    throw new Error("Upload job not found.");
  }

  const frameJob = job.frameJobs.find((item) => item.frameOrder === input.frameOrder);
  if (!frameJob) {
    throw new Error("Frame upload job not found.");
  }
  if (frameJob.status !== PREPARED_FRAME_STATUS || !frameJob.pendingPrefix) {
    throw new Error("Frame is not ready to commit.");
  }

  const frameSnapshot = parseJson<UploadFrameDescriptor>(
    frameJob.frameSnapshotJson,
    "frame upload snapshot",
  );
  const preparedAssets = parseJson<PreparedUploadAsset[]>(
    frameJob.preparedAssetsJson,
    "prepared upload assets",
  );

  for (const asset of preparedAssets) {
    for (const variant of ["original", "thumbnail"] as const) {
      await assertLikelyImageAssetUrl(asset[variant].logicalPath);
    }
  }

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

  await prisma.$transaction([
    prisma.frame.deleteMany({
      where: {
        id: {
          in: existingFrames.map((frame) => frame.id),
        },
      },
    }),
    prisma.frame.create({
      data: {
        groupId: job.group.id,
        title: frameSnapshot.title,
        caption: frameSnapshot.caption,
        order: frameSnapshot.order,
        isPublic: true,
        storagePrefix: frameJob.pendingPrefix,
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
      },
    }),
    prisma.case.update({
      where: { id: job.case.id },
      data: {
        coverAssetId: null,
      },
    }),
    prisma.frameUploadJob.update({
      where: { id: frameJob.id },
      data: {
        status: COMMITTED_FRAME_STATUS,
        committedAt: new Date(),
      },
    }),
    prisma.groupUploadJob.update({
      where: { id: job.id },
      data: {
        committedFrameCount: {
          increment: 1,
        },
      },
    }),
  ]);

  for (const frame of existingFrames) {
    if (frame.storagePrefix && frame.storagePrefix !== frameJob.pendingPrefix) {
      await deleteInternalAssetPrefix(frame.storagePrefix);
    }
  }

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
  const job = await prisma.groupUploadJob.findUnique({
    where: { id: input.groupUploadJobId },
    include: {
      case: true,
      group: true,
      frameJobs: true,
    },
  });

  if (!job || job.status !== ACTIVE_JOB_STATUS) {
    throw new Error("Upload job not found.");
  }

  const allCommitted = job.frameJobs.every((frameJob) => frameJob.status === COMMITTED_FRAME_STATUS);
  if (!allCommitted) {
    throw new Error("Not every frame in the upload job has been committed.");
  }

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

  return {
    groupUploadJobId: job.id,
    caseSlug: job.case.slug,
    groupSlug: job.group.slug,
    committedFrameCount: job.committedFrameCount,
  };
}
