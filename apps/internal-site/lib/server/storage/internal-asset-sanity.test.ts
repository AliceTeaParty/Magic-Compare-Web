import { beforeEach, describe, expect, it, vi } from "vitest";
import { StorageValidationError } from "@/lib/server/api/errors";
import { assertLikelyImageAssetUrl } from "./internal-asset-sanity";

const mocks = vi.hoisted(() => ({
  readInternalAssetPrefix: vi.fn(),
}));

vi.mock("./internal-assets", () => ({
  readInternalAssetPrefix: mocks.readInternalAssetPrefix,
}));

describe("internal asset sanity", () => {
  beforeEach(() => {
    mocks.readInternalAssetPrefix.mockReset();
  });

  it("converts storage SDK errors into safe validation diagnostics", async () => {
    mocks.readInternalAssetPrefix.mockRejectedValue({
      Code: "SignatureDoesNotMatch",
      $metadata: { httpStatusCode: 403, requestId: "request-123" },
    });

    await expect(assertLikelyImageAssetUrl("/groups/test/1/original.png")).rejects.toMatchObject({
      name: StorageValidationError.name,
      status: 502,
      diagnostic: {
        logicalPath: "/groups/test/1/original.png",
        code: "SignatureDoesNotMatch",
        requestId: "request-123",
        upstreamStatus: 403,
      },
    });
  });
});
