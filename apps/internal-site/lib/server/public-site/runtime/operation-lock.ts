export class PublicSiteOperationConflictError extends Error {}

let activePublicSiteOperation:
  | {
      label: "export" | "deploy";
      promise: Promise<unknown>;
    }
  | null = null;

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
      `Public site ${activePublicSiteOperation.label} is already running. Please wait for it to finish.`,
    );
  }

  const promise = action();
  activePublicSiteOperation = {
    label,
    promise,
  };

  try {
    return await promise;
  } finally {
    // Compare promises before clearing so a later operation cannot be unlocked by an earlier one
    // finishing after the shared state has already been replaced.
    if (activePublicSiteOperation?.promise === promise) {
      activePublicSiteOperation = null;
    }
  }
}
