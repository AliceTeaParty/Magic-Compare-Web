import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { validateAndGenerateAssetPlaceholderJson } from "./asset-placeholders";

const mocks = vi.hoisted(() => ({
  readInternalAssetBytes: vi.fn(),
  readInternalAssetPrefix: vi.fn(),
  assertLikelyImageAssetUrl: vi.fn(),
  assertLikelyImageBytes: vi.fn(),
}));

vi.mock("./internal-assets", () => ({
  readInternalAssetBytes: mocks.readInternalAssetBytes,
  readInternalAssetPrefix: mocks.readInternalAssetPrefix,
}));

vi.mock("./internal-asset-sanity", () => ({
  assertLikelyImageAssetUrl: mocks.assertLikelyImageAssetUrl,
  assertLikelyImageBytes: mocks.assertLikelyImageBytes,
}));

describe("validated asset placeholders", () => {
  beforeEach(() => {
    mocks.readInternalAssetBytes.mockReset();
    mocks.readInternalAssetPrefix.mockReset();
    mocks.assertLikelyImageAssetUrl.mockReset();
    mocks.assertLikelyImageBytes.mockReset();
  });

  it("validates and generates a placeholder from one thumbnail read", async () => {
    const thumbnail = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#cc2211" },
    })
      .png()
      .toBuffer();
    mocks.readInternalAssetBytes.mockResolvedValue(thumbnail);

    const placeholder = await validateAndGenerateAssetPlaceholderJson("/groups/a/thumb.png");

    expect(mocks.readInternalAssetBytes).toHaveBeenCalledTimes(1);
    expect(mocks.readInternalAssetPrefix).not.toHaveBeenCalled();
    expect(mocks.assertLikelyImageBytes).toHaveBeenCalledWith(
      "/groups/a/thumb.png",
      thumbnail.subarray(0, 512),
    );
    expect(JSON.parse(placeholder ?? "null")).toMatchObject({
      dataUrl: expect.stringMatching(/^data:image\/webp;base64,/),
    });
  });

  it("falls back to the required prefix check when optional preview reading fails", async () => {
    mocks.readInternalAssetBytes.mockRejectedValue(new Error("thumbnail exceeds preview limit"));
    mocks.assertLikelyImageAssetUrl.mockResolvedValue(undefined);

    await expect(
      validateAndGenerateAssetPlaceholderJson("/groups/a/thumb.png"),
    ).resolves.toBeNull();

    expect(mocks.assertLikelyImageAssetUrl).toHaveBeenCalledWith("/groups/a/thumb.png");
  });
});
