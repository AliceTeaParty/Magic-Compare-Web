import { ConflictError } from "@/lib/server/api/errors";

export class PublicSiteOperationConflictError extends ConflictError {}

let activePublicSiteOperation: "publish" | "export" | "deploy" | null = null;

/**
 * Keeps manifest mutations and export/deploy operations from reading or replacing each other's
 * inputs inside the single workstation process.
 */
export async function withPublicSiteOperationLock<T>(
  label: "publish" | "export" | "deploy",
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
