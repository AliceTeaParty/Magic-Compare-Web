import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { readInternalAsset } = vi.hoisted(() => ({
  readInternalAsset: vi.fn(),
}));

vi.mock("@/lib/server/storage/internal-assets", () => ({
  readInternalAsset,
}));

describe("GET /internal-assets/[...assetPath]", () => {
  it("returns an internal asset response", async () => {
    readInternalAsset.mockResolvedValue({
      body: Uint8Array.from(Buffer.from("png")),
      contentType: "image/png",
      contentLength: 3,
      lastModified: new Date("2026-03-19T07:00:00.000Z"),
    });

    const response = await GET(new Request("http://localhost:3000/internal-assets/foo"), {
      params: Promise.resolve({
        assetPath: ["2026", "test-example", "001", "before.png"],
      }),
    });

    expect(readInternalAsset).toHaveBeenCalledWith(
      "/internal-assets/2026/test-example/001/before.png",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("png"));
  });

  it("returns 404 when the asset is missing", async () => {
    readInternalAsset.mockRejectedValue(new Error("missing"));

    const response = await GET(new Request("http://localhost:3000/internal-assets/foo"), {
      params: Promise.resolve({
        assetPath: ["2026", "test-example", "001", "missing.png"],
      }),
    });

    expect(response.status).toBe(404);
  });
});
