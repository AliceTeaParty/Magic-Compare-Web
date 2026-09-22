import { describe, expect, it, vi } from "vitest";
import { PublicSiteOperationConflictError, withPublicSiteOperationLock } from "./operation-lock";

describe("public site operation lock", () => {
  it.each(["success", "failure"] as const)(
    "rejects overlapping work and releases the lock after %s",
    async (outcome) => {
      let resolve!: (value: string) => void;
      let reject!: (error: Error) => void;
      const pending = new Promise<string>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
      });
      const running = withPublicSiteOperationLock("deploy", () => pending);
      const overlappingAction = vi.fn(async () => "unexpected");

      try {
        await expect(
          withPublicSiteOperationLock("export", overlappingAction),
        ).rejects.toBeInstanceOf(PublicSiteOperationConflictError);
        expect(overlappingAction).not.toHaveBeenCalled();
      } finally {
        if (outcome === "success") {
          resolve("deployed");
          await expect(running).resolves.toBe("deployed");
        } else {
          const failure = new Error("Deployment failed");
          reject(failure);
          await expect(running).rejects.toBe(failure);
        }
      }

      await expect(withPublicSiteOperationLock("export", async () => "exported")).resolves.toBe(
        "exported",
      );
    },
  );
});
