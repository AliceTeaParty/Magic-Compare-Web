import { randomUUID } from "node:crypto";
import type {
  PublicDeployJob,
  PublicDeployStage,
  StartPublicDeployJobResult,
} from "../../../public-deploy-job";
import {
  getCfPagesBranch,
  getCfPagesProjectName,
  getOptionalAbsoluteUrlEnv,
  PUBLIC_SITE_BASE_URL_ENV_NAME,
} from "../../runtime-config";
import { deployPublicSite, ensurePublicDeployConfigured } from "./runtime-service";
import { readPublicDeployState, writePublicDeployState } from "./state-store";

const LATEST_JOB_FILENAME = "latest-job.json";
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const WRANGLER_UPLOAD_PATTERN = /Uploading[^\n\r]*?\((\d+)\s*\/\s*(\d+)\)/g;

interface DeployJobRuntimeState {
  activeJob: PublicDeployJob | null;
  stageStartedAtMs: number;
  wranglerOutputTail: string;
  persistQueue: Promise<void>;
}

declare global {
  var __magicComparePublicDeployJobState: DeployJobRuntimeState | undefined;
}

function runtimeState(): DeployJobRuntimeState {
  globalThis.__magicComparePublicDeployJobState ??= {
    activeJob: null,
    stageStartedAtMs: 0,
    wranglerOutputTail: "",
    persistQueue: Promise.resolve(),
  };
  return globalThis.__magicComparePublicDeployJobState;
}

function cloneJob(job: PublicDeployJob): PublicDeployJob {
  const snapshot = { ...job } as PublicDeployJob & { caseId?: unknown };
  delete snapshot.caseId;
  return {
    ...snapshot,
    stageSequence: [...job.stageSequence],
    stageDurationsMs: { ...job.stageDurationsMs },
    uploadProgress: job.uploadProgress ? { ...job.uploadProgress } : null,
  };
}

/** Serializes frequent progress writes so an older callback cannot overwrite a newer stage. */
function queueJobPersistence(job: PublicDeployJob): void {
  const state = runtimeState();
  const snapshot = cloneJob(job);
  state.persistQueue = state.persistQueue
    .then(() => writePublicDeployState(LATEST_JOB_FILENAME, snapshot))
    .catch((error) => {
      console.error("[public-deploy] Failed to persist job state:", error);
    });
}

function resolvePublicSiteUrl(projectName: string): string | null {
  const configured = getOptionalAbsoluteUrlEnv(PUBLIC_SITE_BASE_URL_ENV_NAME);
  return configured || (projectName ? `https://${projectName}.pages.dev` : null);
}

function stageSequence(): PublicDeployStage[] {
  return ["checking", "building", "preparing", "uploading"];
}

/** Finalizes timing for the previous stage before moving the persistent job to the next phase. */
function moveToStage(job: PublicDeployJob, nextStage: PublicDeployStage): void {
  if (job.stage === nextStage) return;

  const state = runtimeState();
  const now = Date.now();
  job.stageDurationsMs[job.stage] =
    (job.stageDurationsMs[job.stage] ?? 0) + (now - state.stageStartedAtMs);
  job.stage = nextStage;
  job.completedStageCount = Math.max(0, job.stageSequence.indexOf(nextStage));
  job.updatedAt = new Date(now).toISOString();
  job.uploadProgress = null;
  state.stageStartedAtMs = now;
  queueJobPersistence(job);
}

/** Extracts Wrangler's real uploaded/total file count from streamed terminal output. */
export function parseWranglerUploadProgress(
  output: string,
): { completed: number; total: number } | null {
  const normalized = output.replace(ANSI_ESCAPE_PATTERN, "");
  const matches = [...normalized.matchAll(WRANGLER_UPLOAD_PATTERN)];
  const lastMatch = matches.at(-1);
  if (!lastMatch) return null;

  const completed = Number.parseInt(lastMatch[1], 10);
  const total = Number.parseInt(lastMatch[2], 10);
  return Number.isFinite(completed) && Number.isFinite(total) && total > 0
    ? { completed, total }
    : null;
}

/** Keeps only enough streamed output to handle progress tokens split across adjacent chunks. */
function updateWranglerProgress(job: PublicDeployJob, text: string): void {
  const state = runtimeState();
  state.wranglerOutputTail = `${state.wranglerOutputTail}${text}`.slice(-2048);
  const progress = parseWranglerUploadProgress(state.wranglerOutputTail);
  if (
    !progress ||
    (progress.completed === job.uploadProgress?.completed &&
      progress.total === job.uploadProgress.total)
  ) {
    return;
  }

  job.uploadProgress = progress;
  job.updatedAt = new Date().toISOString();
  queueJobPersistence(job);
}

/** Completes a job in one place so success, skip, and failure produce comparable production data. */
async function finishJob(
  job: PublicDeployJob,
  outcome: { error?: string; skipped?: boolean },
): Promise<void> {
  const state = runtimeState();
  const now = Date.now();
  job.stageDurationsMs[job.stage] =
    (job.stageDurationsMs[job.stage] ?? 0) + (now - state.stageStartedAtMs);
  job.status = outcome.error ? "failed" : "succeeded";
  job.completedStageCount = outcome.error ? job.completedStageCount : job.stageSequence.length;
  job.completedAt = new Date(now).toISOString();
  job.updatedAt = job.completedAt;
  job.elapsedMs = now - new Date(job.startedAt).getTime();
  job.skipped = Boolean(outcome.skipped);
  job.error = outcome.error ?? null;
  queueJobPersistence(job);

  console.info(
    "[public-deploy]",
    JSON.stringify({
      jobId: job.id,
      status: job.status,
      skipped: job.skipped,
      elapsedMs: job.elapsedMs,
      stageDurationsMs: job.stageDurationsMs,
      error: job.error,
    }),
  );
  await state.persistQueue;
}

/** Runs outside the request lifecycle while continually persisting small, recoverable snapshots. */
async function executeJob(job: PublicDeployJob): Promise<void> {
  try {
    const result = await deployPublicSite({
      onStage: (stage) => moveToStage(job, stage),
      onOutput: (event) => {
        if (event.source === "wrangler") updateWranglerProgress(job, event.text);
      },
    });
    await finishJob(job, { skipped: result.skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : "部署公开站点失败。";
    await finishJob(job, { error: message.slice(0, 4000) });
  }
}

/** Starts one deployment or returns the currently running job for repeat clicks. */
export async function startPublicDeployJob(): Promise<StartPublicDeployJobResult> {
  const state = runtimeState();
  if (state.activeJob?.status === "running") {
    return { job: cloneJob(state.activeJob), reused: true };
  }
  ensurePublicDeployConfigured();

  const now = new Date();
  const projectName = getCfPagesProjectName() ?? "";
  const job: PublicDeployJob = {
    id: randomUUID(),
    status: "running",
    stage: "checking",
    stageSequence: stageSequence(),
    completedStageCount: 0,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    elapsedMs: null,
    stageDurationsMs: {},
    uploadProgress: null,
    projectName,
    branch: getCfPagesBranch(),
    publicSiteUrl: resolvePublicSiteUrl(projectName),
    skipped: false,
    error: null,
  };

  state.activeJob = job;
  state.stageStartedAtMs = now.getTime();
  state.wranglerOutputTail = "";
  try {
    await writePublicDeployState(LATEST_JOB_FILENAME, job);
  } catch (error) {
    // A job must not remain marked running when its initial recoverable snapshot could not be
    // created; otherwise every later click would reuse a task that never started.
    state.activeJob = null;
    throw error;
  }
  void executeJob(job);
  return { job: cloneJob(job), reused: false };
}

/** Restores the latest job; a persisted running state without a live process is marked interrupted. */
export async function getPublicDeployJob(jobId?: string | null): Promise<PublicDeployJob | null> {
  const state = runtimeState();
  if (state.activeJob && (!jobId || state.activeJob.id === jobId)) {
    return cloneJob(state.activeJob);
  }

  const persisted = await readPublicDeployState<PublicDeployJob>(LATEST_JOB_FILENAME);
  if (!persisted || (jobId && persisted.id !== jobId)) return null;
  const restored = cloneJob(persisted);
  if (restored.status !== "running") return restored;

  const now = Date.now();
  const interrupted: PublicDeployJob = {
    ...restored,
    status: "failed",
    completedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    elapsedMs: now - new Date(restored.startedAt).getTime(),
    error: "部署进程已中断，请重新部署。",
  };
  await writePublicDeployState(LATEST_JOB_FILENAME, interrupted);
  return interrupted;
}
