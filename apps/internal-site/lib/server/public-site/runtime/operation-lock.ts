export class PublicSiteOperationConflictError extends Error {}

let activePublicSiteOperation:
  | {
      label: "export" | "deploy";
      promise: Promise<unknown>;
    }
  | null = null;

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
    if (activePublicSiteOperation?.promise === promise) {
      activePublicSiteOperation = null;
    }
  }
}
