import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { readFile, stat, resolveExistingInternalAssetFile } = vi.hoisted(() => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  resolveExistingInternalAssetFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile,
  stat,
}));

vi.mock("@/lib/server/storage/internal-assets", () => ({
  resolveExistingInternalAssetFile,
}));

describe("GET /internal-assets/[...assetPath]", () => {
  it("returns a runtime asset response", async () => {
    resolveExistingInternalAssetFile.mockResolvedValue(
      "/runtime/internal-assets/2026/test-example/001/before.png",
    );
    readFile.mockResolvedValue(Buffer.from("png"));
    stat.mockResolvedValue({
      size: 3,
      mtime: new Date("2026-03-19T07:00:00.000Z"),
    });

    const response = await GET(new Request("http://localhost:3000/internal-assets/foo"), {
      params: Promise.resolve({
        assetPath: ["2026", "test-example", "001", "before.png"],
      }),
    });

    expect(resolveExistingInternalAssetFile).toHaveBeenCalledWith(
      "/internal-assets/2026/test-example/001/before.png",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("png"));
  });

  it("returns 404 when the asset is missing", async () => {
    resolveExistingInternalAssetFile.mockRejectedValue(new Error("missing"));

    const response = await GET(new Request("http://localhost:3000/internal-assets/foo"), {
      params: Promise.resolve({
        assetPath: ["2026", "test-example", "001", "missing.png"],
      }),
    });

    expect(response.status).toBe(404);
  });
});
