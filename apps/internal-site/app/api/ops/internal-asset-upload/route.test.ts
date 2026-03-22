import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { headInternalAsset, uploadInternalAssetBuffer } = vi.hoisted(() => ({
  headInternalAsset: vi.fn(),
  uploadInternalAssetBuffer: vi.fn(),
}));

vi.mock("@/lib/server/storage/internal-assets", () => ({
  headInternalAsset,
  uploadInternalAssetBuffer,
}));

describe("POST /api/ops/internal-asset-upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads a new internal asset through the server proxy", async () => {
    headInternalAsset.mockResolvedValue(null);
    uploadInternalAssetBuffer.mockResolvedValue(undefined);

    const formData = new FormData();
    formData.set("assetUrl", "/internal-assets/2026/test-example/001/before.png");
    formData.set("sha256", "abc123");
    formData.set("source-size", "4096");
    formData.set("derivative-kind", "original");
    formData.set(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "before.png", {
        type: "image/png",
      }),
    );

    const response = await POST(
      new Request("http://localhost:3000/api/ops/internal-asset-upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(headInternalAsset).toHaveBeenCalledWith(
      "/internal-assets/2026/test-example/001/before.png",
    );
    expect(uploadInternalAssetBuffer).toHaveBeenCalledOnce();
  });

  it("skips uploads when the stored object already matches metadata", async () => {
    headInternalAsset.mockResolvedValue({
      metadata: {
        sha256: "abc123",
        "source-size": "4096",
        "derivative-kind": "original",
      },
      size: 4096,
    });

    const formData = new FormData();
    formData.set("assetUrl", "/internal-assets/2026/test-example/001/before.png");
    formData.set("sha256", "abc123");
    formData.set("source-size", "4096");
    formData.set("derivative-kind", "original");
    formData.set(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "before.png", {
        type: "image/png",
      }),
    );

    const response = await POST(
      new Request("http://localhost:3000/api/ops/internal-asset-upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "skipped" });
    expect(uploadInternalAssetBuffer).not.toHaveBeenCalled();
  });

  it("rejects invalid multipart payloads", async () => {
    const formData = new FormData();
    formData.set("assetUrl", "");

    const response = await POST(
      new Request("http://localhost:3000/api/ops/internal-asset-upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
  });
});
