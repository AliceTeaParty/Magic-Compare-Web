import { randomUUID } from "node:crypto";
import { ConflictError } from "@/lib/server/api/errors";
import { mapWithConcurrency } from "@/lib/server/concurrency/map-with-concurrency";
import { assertLikelyImageAssetUrl } from "@/lib/server/storage/internal-asset-sanity";
import {
  createPresignedInternalAssetUpload,
  deleteInternalAssetPrefix,
} from "@/lib/server/storage/internal-assets";
import type { UploadAssetDescriptor, UploadFrameDescriptor } from "./contracts";
import {
  COMMITTED_FRAME_STATUS,
  PREPARED_FRAME_STATUS,
  type ActiveFrameUploadJob,
} from "./upload-job-repository";

const STORAGE_OPERATION_CONCURRENCY = 6;

export type PreparedUploadAsset = UploadAssetDescriptor & {
  original: UploadAssetDescriptor["original"] & { logicalPath: string };
  thumbnail: UploadAssetDescriptor["thumbnail"] & { logicalPath: string };
};

/** Uses one-based folders so object listings match the operator-facing frame number. */
export function buildFramePendingPrefix(storageRoot: string, frameOrder: number): string {
  return `${storageRoot}/${frameOrder + 1}/${randomUUID()}`;
}

/** Converts a frame snapshot into server-owned original and thumbnail object keys. */
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

/** Signs generated files through the common bounded queue and preserves descriptor order. */
export async function buildPresignedFiles(preparedAssets: PreparedUploadAsset[]) {
  const descriptors = preparedAssets.flatMap((asset) =>
    (["original", "thumbnail"] as const).map((variant) => ({
      slot: asset.slot,
      variant,
      prepared: asset[variant],
    })),
  );

  return mapWithConcurrency(
    descriptors,
    STORAGE_OPERATION_CONCURRENCY,
    async ({ slot, variant, prepared }) => {
      const signed = await createPresignedInternalAssetUpload({
        logicalPath: prepared.logicalPath,
      });
      return {
        slot,
        variant,
        logicalPath: prepared.logicalPath,
        uploadUrl: signed.uploadUrl,
        expiresInSeconds: signed.expiresInSeconds,
        contentType: prepared.contentType,
      };
    },
  );
}

/** Prepare accepts pending and retryable prepared rows, but never committed frames. */
export function assertFrameCanPrepare(frameJob: ActiveFrameUploadJob): void {
  if (frameJob.status === COMMITTED_FRAME_STATUS) {
    throw new ConflictError("Frame is already committed.");
  }
}

/** Commit requires both a prepared prefix and its persisted asset manifest. */
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
    throw new ConflictError("Frame is not ready to commit.");
  }
}

/** Verifies every uploaded object before database rows point to the new revision. */
export async function assertPreparedAssetsUploaded(
  preparedAssets: PreparedUploadAsset[],
): Promise<void> {
  const logicalPaths = preparedAssets.flatMap((asset) => [
    asset.original.logicalPath,
    asset.thumbnail.logicalPath,
  ]);
  await mapWithConcurrency(logicalPaths, STORAGE_OPERATION_CONCURRENCY, (logicalPath) =>
    assertLikelyImageAssetUrl(logicalPath),
  );
}

/** Deletes superseded prefixes only after the replacement frame has committed. */
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
