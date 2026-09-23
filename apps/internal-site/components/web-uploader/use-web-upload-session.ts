import { useEffect, useRef, useState } from "react";
import type { GenerationProgress, PreflightedUploadFrame } from "./asset-generator";
import { WebUploadRunner } from "./upload-runner";
import type { UploadRunnerSnapshot } from "./web-upload-types";
import type { UploadGroupMeta } from "./web-upload-workspace-sections";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";
import { useAppNotifications } from "../notifications/use-app-notifications";

const INPUT_HASH_STORAGE_PREFIX = "magic_compare_web_upload:";

function buildInitialUploadSnapshot(): UploadRunnerSnapshot {
  return {
    stage: "idle",
    jobId: null,
    inputHash: null,
    completedFrames: 0,
    totalFrames: 0,
    completedFiles: 0,
    totalFiles: 0,
    failedCount: 0,
    retriedCount: 0,
    message: "选择文件夹后开始检查。",
    frames: [],
    result: null,
  };
}

function writeUploadResumeHint(groupSlug: string, inputHash: string) {
  try {
    window.localStorage.setItem(`${INPUT_HASH_STORAGE_PREFIX}${groupSlug}`, inputHash);
  } catch {
    // Browser storage is optional; the active runner remains authoritative for this session.
  }
}

function removeUploadResumeHint(groupSlug: string) {
  try {
    window.localStorage.removeItem(`${INPUT_HASH_STORAGE_PREFIX}${groupSlug}`);
  } catch {
    // Inability to clear an optional resume hint must not block server-side cancellation.
  }
}

function getCaseInput(cases: CaseCatalogItem[], selectedCaseSlug: string) {
  const existing = cases.find((item) => item.slug === selectedCaseSlug);
  if (!existing) throw new Error("请先新建并选择目标项目。");
  return {
    slug: existing.slug,
    title: existing.title,
    summary: existing.summary,
    tags: existing.tags,
    coverAssetLabel: null,
  };
}

interface StartUploadOptions {
  canStart: boolean;
  cases: CaseCatalogItem[];
  ensurePreflightedFrames: () => Promise<PreflightedUploadFrame[]>;
  groupInput: UploadGroupMeta;
  onGenerationProgress: (progress: GenerationProgress) => void;
  selectedCaseSlug: string;
}

/** Owns the remote upload runner and its render snapshot independently from editable plan state. */
export function useWebUploadSession() {
  const runnerRef = useRef<WebUploadRunner | null>(null);
  const unsubscribeRunnerRef = useRef<(() => void) | null>(null);
  const [snapshot, setSnapshot] = useState<UploadRunnerSnapshot>(() =>
    buildInitialUploadSnapshot(),
  );
  const { pushNotification } = useAppNotifications();

  useEffect(
    () => () => {
      unsubscribeRunnerRef.current?.();
      runnerRef.current?.dispose();
    },
    [],
  );

  function resetSession(stage: UploadRunnerSnapshot["stage"] = "idle") {
    unsubscribeRunnerRef.current?.();
    unsubscribeRunnerRef.current = null;
    runnerRef.current?.dispose();
    runnerRef.current = null;
    setSnapshot({ ...buildInitialUploadSnapshot(), stage });
  }

  /** Builds the runner only after preflight succeeds, then reuses it for pause/failure resumes. */
  async function startOrResumeUpload({
    canStart,
    cases,
    ensurePreflightedFrames,
    groupInput,
    onGenerationProgress,
    selectedCaseSlug,
  }: StartUploadOptions) {
    if (!canStart) return;

    try {
      if (!runnerRef.current) {
        setSnapshot({
          ...buildInitialUploadSnapshot(),
          stage: "generating",
          message: "正在完整预检素材。",
        });
      }
      const frames = await ensurePreflightedFrames();
      const generation = await import("./asset-generator");
      const framesByOrder = new Map(frames.map((frame) => [frame.descriptor.order, frame]));
      const runner =
        runnerRef.current ??
        new WebUploadRunner({
          caseInput: getCaseInput(cases, selectedCaseSlug),
          groupInput: {
            slug: groupInput.slug,
            title: groupInput.title.trim() || "上传图组",
            description: groupInput.description.trim(),
            order: 0,
            tags: [],
          },
          uploadConcurrency: generation.WEB_UPLOAD_WORKER_CONCURRENCY,
          stream: {
            frames: frames.map((frame) => frame.descriptor),
            generateFrame: async (frameOrder, signal) => {
              const frame = framesByOrder.get(frameOrder);
              if (!frame) throw new Error(`找不到 Frame ${frameOrder + 1} 的预检结果。`);
              return generation.generateUploadFrame(frame, {
                signal,
                onProgress: onGenerationProgress,
              });
            },
          },
        });

      if (!runnerRef.current) {
        runnerRef.current = runner;
        unsubscribeRunnerRef.current = runner.subscribe((nextSnapshot) => {
          setSnapshot(nextSnapshot);
          if (nextSnapshot.inputHash) {
            writeUploadResumeHint(
              nextSnapshot.result?.groupSlug ?? groupInput.slug,
              nextSnapshot.inputHash,
            );
          }
        });
      }
      await runner.start();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "上传失败。";
      pushNotification(message, "error", { key: "web-upload-runner-error" });
      setSnapshot({ ...buildInitialUploadSnapshot(), stage: "failed", message });
    }
  }

  function pauseUpload() {
    runnerRef.current?.pause();
  }

  async function abandonUpload(groupSlug: string) {
    try {
      await runnerRef.current?.cancel();
      removeUploadResumeHint(groupSlug);
      resetSession();
      pushNotification("已放弃上传。", "info", { key: "web-upload-abandoned" });
      return true;
    } catch (error) {
      pushNotification(error instanceof Error ? error.message : "放弃上传失败。", "error", {
        key: "web-upload-abandon-error",
      });
      return false;
    }
  }

  return {
    abandonUpload,
    pauseUpload,
    resetSession,
    snapshot,
    startOrResumeUpload,
  };
}
