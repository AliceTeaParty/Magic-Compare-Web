import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertLikelyPublicAssets } from "./internal-asset-sanity";

const mocks = vi.hoisted(() => ({
  readInternalAssetPrefix: vi.fn(),
}));

vi.mock("./internal-assets", () => ({
  readInternalAssetPrefix: mocks.readInternalAssetPrefix,
}));

const pngPrefix = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("internal asset sanity concurrency", () => {
  beforeEach(() => {
    mocks.readInternalAssetPrefix.mockReset();
  });

  it("validates legacy public objects with at most eight remote reads", async () => {
    let activeReads = 0;
    let maxActiveReads = 0;
    mocks.readInternalAssetPrefix.mockImplementation(async () => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      await Promise.resolve();
      activeReads -= 1;
      return pngPrefix;
    });

    await assertLikelyPublicAssets(
      Array.from({ length: 10 }, (_, index) => ({
        kind: index % 2 === 0 ? "before" : "after",
        imageUrl: `/groups/test/${index}/original.png`,
        thumbUrl: `/groups/test/${index}/thumbnail.png`,
      })),
    );

    expect(mocks.readInternalAssetPrefix).toHaveBeenCalledTimes(20);
    expect(maxActiveReads).toBe(8);
  });
});
