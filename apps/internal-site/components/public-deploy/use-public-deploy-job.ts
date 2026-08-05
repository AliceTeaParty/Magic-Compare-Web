"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  summarizePublicDeployError,
  type PublicDeployJob,
  type StartPublicDeployJobResult,
} from "@/lib/public-deploy-job";
import { notifyBrowserDeploySuccess } from "../case-workspace/browser-deploy-notifications";
import { useAppNotifications } from "../notifications/use-app-notifications";

interface PublicDeployJobResponse {
  job: PublicDeployJob;
}

/** Reads JSON errors consistently so failed start and polling requests remain actionable. */
async function readResponseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "无法读取部署任务。");
  }
  return payload as T;
}

/** Owns one shell-level deployment task across route changes and mobile drawer transitions. */
export function usePublicDeployJob() {
  const [job, setJob] = useState<PublicDeployJob | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const jobRef = useRef<PublicDeployJob | null>(null);
  const notifiedJobsRef = useRef(new Set<string>());
  const { pushNotification } = useAppNotifications();

  const applyJob = useCallback(
    (nextJob: PublicDeployJob, notifyCompletion = false) => {
      const previousJob = jobRef.current;
      jobRef.current = nextJob;
      setJob(nextJob);

      if (
        !notifyCompletion ||
        nextJob.status === "running" ||
        notifiedJobsRef.current.has(nextJob.id)
      ) {
        return;
      }

      notifiedJobsRef.current.add(nextJob.id);
      if (nextJob.status === "succeeded") {
        const message = nextJob.skipped
          ? "公开站点已是最新版本。"
          : `已部署到 ${nextJob.projectName || "Cloudflare Pages"}。`;
        pushNotification(message, "success");
        if (!nextJob.skipped) {
          notifyBrowserDeploySuccess(nextJob.projectName || "Cloudflare Pages");
        }
        return;
      }

      pushNotification(summarizePublicDeployError(nextJob.error || "部署公开站点失败。"), "error");
      if (previousJob?.status === "running") setPanelOpen(true);
    },
    [pushNotification],
  );

  const refreshJob = useCallback(
    async (jobId?: string, notifyCompletion = true) => {
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      const response = await fetch(`/api/ops/public-deploy${query}`, {
        cache: "no-store",
      });
      if (response.status === 404) return null;
      const payload = await readResponseJson<PublicDeployJobResponse>(response);
      applyJob(payload.job, notifyCompletion);
      return payload.job;
    },
    [applyJob],
  );

  const startDeploy = useCallback(async () => {
    if (jobRef.current?.status === "running") {
      setPanelOpen(true);
      return;
    }

    setPanelOpen(true);
    try {
      const response = await fetch("/api/ops/public-deploy", { method: "POST" });
      const payload = await readResponseJson<StartPublicDeployJobResult>(response);
      applyJob(payload.job);
    } catch (error) {
      setPanelOpen(false);
      pushNotification(error instanceof Error ? error.message : "无法开始部署公开站点。", "error");
    }
  }, [applyJob, pushNotification]);

  useEffect(() => {
    let cancelled = false;
    void refreshJob(undefined, false)
      .then((restoredJob) => {
        if (
          cancelled ||
          !restoredJob ||
          (restoredJob.status !== "running" &&
            Date.now() - new Date(restoredJob.updatedAt).getTime() > 15_000)
        ) {
          return;
        }
        setPanelOpen(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refreshJob]);

  useEffect(() => {
    if (job?.status !== "running") return;

    let cancelled = false;
    let timeoutId = 0;
    const poll = async () => {
      try {
        await refreshJob(job.id);
      } catch {
        // A transient status request must not terminate the deployment or duplicate error toasts.
      } finally {
        if (!cancelled && jobRef.current?.status === "running") {
          timeoutId = window.setTimeout(poll, 900);
        }
      }
    };
    timeoutId = window.setTimeout(poll, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [job?.id, job?.status, refreshJob]);

  return {
    job,
    panelOpen,
    isDeploying: job?.status === "running",
    closePanel: () => setPanelOpen(false),
    startDeploy,
  };
}
