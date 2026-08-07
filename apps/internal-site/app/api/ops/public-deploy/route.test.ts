import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const { getPublicDeployJob, startPublicDeployJob } = vi.hoisted(() => ({
  getPublicDeployJob: vi.fn(),
  startPublicDeployJob: vi.fn(),
}));

vi.mock("@/lib/server/public-site/runtime", () => ({
  getPublicDeployJob,
  startPublicDeployJob,
}));

const runningJob = {
  id: "job-1",
  status: "running",
  stage: "checking",
  stageSequence: ["checking", "building", "preparing", "uploading"],
  completedStageCount: 0,
  startedAt: "2026-08-05T08:00:00.000Z",
  updatedAt: "2026-08-05T08:00:00.000Z",
  completedAt: null,
  elapsedMs: null,
  stageDurationsMs: {},
  uploadProgress: null,
  projectName: "magic-compare-public",
  branch: "main",
  publicSiteUrl: "https://magic-compare-public.pages.dev",
  skipped: false,
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/ops/public-deploy", () => {
  it("starts a background deployment job", async () => {
    startPublicDeployJob.mockResolvedValue({ job: runningJob, reused: false });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/public-deploy", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ job: runningJob, reused: false });
    expect(startPublicDeployJob).toHaveBeenCalledWith();
  });

  it("accepts an empty body", async () => {
    startPublicDeployJob.mockResolvedValue({ job: runningJob, reused: false });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/public-deploy", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(202);
    expect(startPublicDeployJob).toHaveBeenCalledWith();
  });

  it("returns 500 and logs unexpected deployment start failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    startPublicDeployJob.mockRejectedValue(new Error("Cloudflare Pages deploy is not configured."));

    const response = await POST(
      new Request("http://localhost:3000/api/ops/public-deploy", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Cloudflare Pages deploy is not configured.",
    });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("returns the requested deployment job", async () => {
    getPublicDeployJob.mockResolvedValue(runningJob);

    const response = await GET(
      new Request("http://localhost:3000/api/ops/public-deploy?jobId=job-1"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ job: runningJob });
    expect(getPublicDeployJob).toHaveBeenCalledWith("job-1");
  });

  it("returns 404 for an unknown job", async () => {
    getPublicDeployJob.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost:3000/api/ops/public-deploy?jobId=missing"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "没有找到部署任务。" });
  });
});
