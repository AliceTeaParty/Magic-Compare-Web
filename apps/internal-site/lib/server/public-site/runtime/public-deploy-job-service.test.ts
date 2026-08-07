import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicDeployJob } from "../../../public-deploy-job";
import {
  getPublicDeployJob,
  parseWranglerUploadProgress,
  startPublicDeployJob,
} from "./public-deploy-job-service";

const mocks = vi.hoisted(() => ({
  deployPublicSite: vi.fn(),
  ensurePublicDeployConfigured: vi.fn(),
  getCfPagesBranch: vi.fn(),
  getCfPagesProjectName: vi.fn(),
  getOptionalAbsoluteUrlEnv: vi.fn(),
  readPublicDeployState: vi.fn(),
  writePublicDeployState: vi.fn(),
}));

vi.mock("./runtime-service", () => ({
  deployPublicSite: mocks.deployPublicSite,
  ensurePublicDeployConfigured: mocks.ensurePublicDeployConfigured,
}));

vi.mock("./state-store", () => ({
  readPublicDeployState: mocks.readPublicDeployState,
  writePublicDeployState: mocks.writePublicDeployState,
}));

vi.mock("../../runtime-config", () => ({
  getCfPagesBranch: mocks.getCfPagesBranch,
  getCfPagesProjectName: mocks.getCfPagesProjectName,
  getOptionalAbsoluteUrlEnv: mocks.getOptionalAbsoluteUrlEnv,
  PUBLIC_SITE_BASE_URL_ENV_NAME: "MAGIC_COMPARE_PUBLIC_SITE_BASE_URL",
}));

function persistedRunningJob(): PublicDeployJob {
  const job: PublicDeployJob & { caseId: string } = {
    id: "persisted-job",
    caseId: "legacy-case",
    status: "running",
    stage: "building",
    stageSequence: ["checking", "building", "preparing", "uploading"],
    completedStageCount: 1,
    startedAt: new Date(Date.now() - 5000).toISOString(),
    updatedAt: new Date(Date.now() - 1000).toISOString(),
    completedAt: null,
    elapsedMs: null,
    stageDurationsMs: { checking: 100 },
    uploadProgress: null,
    projectName: "magic-compare-public",
    branch: "main",
    publicSiteUrl: "https://compare.example.com",
    skipped: false,
    error: null,
  };
  return job;
}

beforeEach(() => {
  vi.resetAllMocks();
  delete globalThis.__magicComparePublicDeployJobState;
  mocks.getCfPagesProjectName.mockReturnValue("magic-compare-public");
  mocks.getCfPagesBranch.mockReturnValue("main");
  mocks.getOptionalAbsoluteUrlEnv.mockReturnValue("https://compare.example.com");
  mocks.readPublicDeployState.mockResolvedValue(null);
  mocks.writePublicDeployState.mockResolvedValue(undefined);
});

describe("public deploy job progress", () => {
  it("uses the latest Wrangler upload count", () => {
    expect(
      parseWranglerUploadProgress("Uploading... (1/12)\rUploading... (8/12)\rUploading... (12/12)"),
    ).toEqual({ completed: 12, total: 12 });
  });

  it("handles ANSI output and split output tails", () => {
    expect(parseWranglerUploadProgress("\u001b[32mUploading... (4/9)\u001b[0m")).toEqual({
      completed: 4,
      total: 9,
    });
  });

  it("returns null before Wrangler reports a real file count", () => {
    expect(parseWranglerUploadProgress("Validating asset manifest...")).toBeNull();
  });
});

describe("public deploy job lifecycle", () => {
  it("streams stages and keeps the completed job available", async () => {
    mocks.deployPublicSite.mockImplementation(async (observer) => {
      observer?.onStage?.("building");
      observer?.onStage?.("preparing");
      observer?.onStage?.("uploading");
      observer?.onOutput?.({
        source: "wrangler",
        stream: "stdout",
        text: "Uploading... (4/9)",
      });
      return { skipped: false };
    });

    const started = await startPublicDeployJob();
    await vi.waitFor(async () => {
      expect((await getPublicDeployJob(started.job.id))?.status).toBe("succeeded");
    });

    const completed = await getPublicDeployJob(started.job.id);
    expect(completed).toMatchObject({
      status: "succeeded",
      completedStageCount: 4,
      uploadProgress: { completed: 4, total: 9 },
    });
  });

  it("reuses a running deployment instead of starting a second command", async () => {
    let resolveDeploy!: (value: { skipped: boolean }) => void;
    mocks.deployPublicSite.mockReturnValue(
      new Promise((resolve) => {
        resolveDeploy = resolve;
      }),
    );

    const first = await startPublicDeployJob();
    const second = await startPublicDeployJob();

    expect(second).toEqual({ job: first.job, reused: true });
    expect(mocks.deployPublicSite).toHaveBeenCalledTimes(1);
    resolveDeploy({ skipped: false });
    await vi.waitFor(async () => {
      expect((await getPublicDeployJob(first.job.id))?.status).toBe("succeeded");
    });
  });

  it("marks a persisted running job interrupted after a process restart", async () => {
    mocks.readPublicDeployState.mockResolvedValue(persistedRunningJob());

    const restored = await getPublicDeployJob("persisted-job");

    expect(restored).toMatchObject({
      status: "failed",
      error: "部署进程已中断，请重新部署。",
    });
    expect(restored).not.toHaveProperty("caseId");
    expect(mocks.writePublicDeployState).toHaveBeenCalledWith(
      "latest-job.json",
      expect.objectContaining({ status: "failed" }),
    );
  });
});
