import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { exportPublicSite, getPublicSiteOperationErrorStatus } = vi.hoisted(
  () => ({
    exportPublicSite: vi.fn(),
    getPublicSiteOperationErrorStatus: vi.fn(),
  }),
);

vi.mock("@/lib/server/public-site/runtime", () => ({
  exportPublicSite,
  getPublicSiteOperationErrorStatus,
}));

describe("POST /api/ops/public-export", () => {
  it("exports the public site", async () => {
    exportPublicSite.mockResolvedValue({
      stdout: "Build complete",
      stderr: "",
      buildOutputDir: "/out/build",
      exportDir: "/out/export",
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/public-export", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stdout: "Build complete",
      stderr: "",
      buildOutputDir: "/out/build",
      exportDir: "/out/export",
    });
    expect(exportPublicSite).toHaveBeenCalled();
  });

  it("returns 409 when another operation is already running", async () => {
    const conflictError = new Error(
      "Public site export is already running. Please wait for it to finish.",
    );
    exportPublicSite.mockRejectedValue(conflictError);
    getPublicSiteOperationErrorStatus.mockReturnValue(409);

    const response = await POST(
      new Request("http://localhost:3000/api/ops/public-export", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error:
        "Public site export is already running. Please wait for it to finish.",
    });
  });

  it("returns classifyError status for regular errors", async () => {
    exportPublicSite.mockRejectedValue(
      new Error("No published groups were found."),
    );
    getPublicSiteOperationErrorStatus.mockReturnValue(400);

    const response = await POST(
      new Request("http://localhost:3000/api/ops/public-export", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "No published groups were found.",
    });
  });
});
