import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { deployPublicSite, getPublicSiteOperationErrorStatus } = vi.hoisted(
  () => ({
    deployPublicSite: vi.fn(),
    getPublicSiteOperationErrorStatus: vi.fn(),
  }),
);

vi.mock("@/lib/server/public-site/runtime", () => ({
  deployPublicSite,
  getPublicSiteOperationErrorStatus,
}));

describe("POST /api/ops/public-deploy", () => {
  it("deploys the public site", async () => {
    deployPublicSite.mockResolvedValue({
      stdout: "Deploy complete",
      stderr: "",
      buildOutputDir: "/out/build",
      exportDir: "/out/export",
      projectName: "magic-compare-public",
      branch: "main",
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/public-deploy", {
        method: "POST",
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stdout: "Deploy complete",
      stderr: "",
      buildOutputDir: "/out/build",
      exportDir: "/out/export",
      projectName: "magic-compare-public",
      branch: "main",
    });
    expect(deployPublicSite).toHaveBeenCalledWith(undefined);
  });

  it("passes optional caseId for pre-deploy publish", async () => {
    deployPublicSite.mockResolvedValue({
      stdout: "",
      stderr: "",
      buildOutputDir: "/out/build",
      exportDir: "/out/export",
      projectName: "magic-compare-public",
      branch: null,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/public-deploy", {
        method: "POST",
        body: JSON.stringify({ caseId: "case-1" }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(deployPublicSite).toHaveBeenCalledWith("case-1");
  });

  it("accepts empty body gracefully", async () => {
    deployPublicSite.mockResolvedValue({
      stdout: "",
      stderr: "",
      buildOutputDir: "/out/build",
      exportDir: "/out/export",
      projectName: "p",
      branch: null,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/public-deploy", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(deployPublicSite).toHaveBeenCalledWith(undefined);
  });

  it("returns 409 when another operation is already running", async () => {
    const conflictError = new Error(
      "Public site deploy is already running. Please wait for it to finish.",
    );
    deployPublicSite.mockRejectedValue(conflictError);
    getPublicSiteOperationErrorStatus.mockReturnValue(409);

    const response = await POST(
      new Request("http://localhost:3000/api/ops/public-deploy", {
        method: "POST",
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error:
        "Public site deploy is already running. Please wait for it to finish.",
    });
  });

  it("returns classifyError status for config errors", async () => {
    deployPublicSite.mockRejectedValue(
      new Error("Cloudflare Pages deploy is not configured."),
    );
    getPublicSiteOperationErrorStatus.mockReturnValue(400);

    const response = await POST(
      new Request("http://localhost:3000/api/ops/public-deploy", {
        method: "POST",
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Cloudflare Pages deploy is not configured.",
    });
  });
});
