import { ConflictError } from "@/lib/server/api/errors";

export class PublicSiteOperationConflictError extends ConflictError {}

let activePublicSiteOperation: "export" | "deploy" | null = null;

/**
 * Serializes export/deploy operations inside the process so concurrent button clicks cannot race on
 * the same build output directory or deployment command.
 */
export async function withPublicSiteOperationLock<T>(
  label: "export" | "deploy",
  action: () => Promise<T>,
): Promise<T> {
  if (activePublicSiteOperation) {
    throw new PublicSiteOperationConflictError(
      `Public site ${activePublicSiteOperation} is already running. Please wait for it to finish.`,
    );
  }

  activePublicSiteOperation = label;
  try {
    return await action();
  } finally {
    // Overlapping calls are rejected above, so only this invocation can own and release the lock.
    activePublicSiteOperation = null;
  }
}
