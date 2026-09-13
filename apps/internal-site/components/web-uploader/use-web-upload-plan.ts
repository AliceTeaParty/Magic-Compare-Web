import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { GenerationProgress, PreflightedUploadFrame } from "./asset-generator";
import { scanBrowserUploadFiles } from "./source-scanner";
import type { BrowserUploadFile, WebUploadPlan } from "./web-upload-types";
import {
  buildPlanView,
  renameUploadPlanAssetLabel,
  reorderUploadPlan,
  setUploadPlanFrameTitleMode,
  setUploadPlanHeatmapReference,
  type FrameTitleMode,
  type PlanView,
  type UploadPlanImageColumn,
} from "./web-upload-view-model";
import { useAppNotifications } from "../notifications/use-app-notifications";

const BROWSER_RECOMMENDATION_MESSAGE = "推荐使用 Chrome / Edge 选择整个目录上传。";

type BrowserDirectoryHandle = {
  name: string;
  values(): AsyncIterable<BrowserFileSystemHandle>;
};

type BrowserFileSystemHandle =
  | { kind: "file"; name: string; getFile(): Promise<File> }
  | { kind: "directory"; name: string; values(): AsyncIterable<BrowserFileSystemHandle> };

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<BrowserDirectoryHandle>;
};

async function readDirectoryHandle(handle: BrowserDirectoryHandle): Promise<BrowserUploadFile[]> {
  const entries: BrowserUploadFile[] = [];

  async function walk(directory: BrowserDirectoryHandle, prefix: string) {
    for await (const entry of directory.values()) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "file") {
        entries.push({ relativePath, file: await entry.getFile() });
      } else {
        await walk(entry, relativePath);
      }
    }
  }

  await walk(handle, "");
  return entries;
}

function filesFromInput(fileList: FileList): BrowserUploadFile[] {
  return [...fileList].map((file) => ({
    file,
    relativePath:
      typeof file.webkitRelativePath === "string" && file.webkitRelativePath
        ? file.webkitRelativePath
        : file.name,
  }));
}

/**
 * Owns source selection, compact plan state, preflight cache, and pre-upload plan mutations. Heavy
 * File and generated-frame data remain in refs so rendering scales with the compact view model.
 */
export function useWebUploadPlan() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const planRef = useRef<WebUploadPlan | null>(null);
  const preflightFramesRef = useRef<PreflightedUploadFrame[] | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const [planView, setPlanView] = useState<PlanView | null>(null);
  const [frameTitleMode, setFrameTitleMode] = useState<FrameTitleMode>("inferred");
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [expandedFrameId, setExpandedFrameId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const { pushNotification } = useAppNotifications();

  useEffect(() => {
    if (!(window as DirectoryPickerWindow).showDirectoryPicker) {
      pushNotification(BROWSER_RECOMMENDATION_MESSAGE, "info", {
        key: "web-upload-browser-recommendation",
      });
    }
  }, [pushNotification]);

  useEffect(() => () => generationAbortRef.current?.abort(), []);

  function invalidatePreflight() {
    preflightFramesRef.current = null;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setGenerationProgress(null);
  }

  /** Accepts a fresh scanner result and resets every derived plan choice to that source. */
  function applyScannedFiles(
    entries: BrowserUploadFile[],
    sourceRootName: string,
    onPlanAccepted: (plan: WebUploadPlan) => void,
  ) {
    const plan = scanBrowserUploadFiles(entries, sourceRootName);
    invalidatePreflight();
    planRef.current = plan;
    setExpandedFrameId(null);
    setFrameTitleMode("inferred");
    setPlanView(buildPlanView(plan));
    onPlanAccepted(plan);

    const hasErrors = plan.issues.some((issue) => issue.severity === "error");
    pushNotification(
      hasErrors ? "检查发现阻塞问题，请先修正文件夹。" : "检查完成，可以开始上传。",
      hasErrors ? "warning" : "success",
      { key: "web-upload-scan-result" },
    );
  }

  async function chooseDirectory(locked: boolean, onPlanAccepted: (plan: WebUploadPlan) => void) {
    if (locked) return;
    const picker = window as DirectoryPickerWindow;
    if (!picker.showDirectoryPicker) {
      inputRef.current?.click();
      return;
    }

    try {
      const handle = await picker.showDirectoryPicker();
      setIsScanning(true);
      applyScannedFiles(await readDirectoryHandle(handle), handle.name, onPlanAccepted);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      pushNotification(error instanceof Error ? error.message : "读取目录失败。", "error", {
        key: "web-upload-directory-error",
      });
    } finally {
      setIsScanning(false);
    }
  }

  function handleFallbackInput(
    event: ChangeEvent<HTMLInputElement>,
    onPlanAccepted: (plan: WebUploadPlan) => void,
  ) {
    const files = event.target.files;
    if (!files?.length) return;

    setIsScanning(true);
    try {
      const entries = filesFromInput(files);
      const sourceRootName =
        entries[0]?.relativePath.split("/").filter(Boolean)[0] ?? "uploaded-group";
      applyScannedFiles(entries, sourceRootName, onPlanAccepted);
    } catch (error) {
      pushNotification(error instanceof Error ? error.message : "读取目录失败。", "error", {
        key: "web-upload-directory-error",
      });
    } finally {
      setIsScanning(false);
      event.target.value = "";
    }
  }

  /** Completes decode, dimensions, and hashing once before a remote upload job is created. */
  async function ensurePreflightedFrames() {
    const plan = planRef.current;
    if (!plan) throw new Error("请先选择文件夹。");
    if (plan.frames.length === 0) throw new Error("所选目录中没有可上传的对比帧。");
    if (preflightFramesRef.current) return preflightFramesRef.current;

    const abortController = new AbortController();
    generationAbortRef.current = abortController;
    const { preflightUploadFrames } = await import("./asset-generator");
    try {
      const frames = await preflightUploadFrames(plan.frames, setGenerationProgress, {
        heatmapReferenceLabel: plan.heatmapReferenceLabel,
        signal: abortController.signal,
      });
      if (abortController.signal.aborted) {
        throw new DOMException("Upload generation was abandoned.", "AbortError");
      }
      preflightFramesRef.current = frames;
      return frames;
    } finally {
      if (generationAbortRef.current === abortController) generationAbortRef.current = null;
    }
  }

  function applyPlanUpdate(nextPlan: WebUploadPlan | null) {
    if (!nextPlan) return;
    invalidatePreflight();
    planRef.current = nextPlan;
    setPlanView(buildPlanView(nextPlan));
  }

  function reorderPairingRows(activeFrameId: string, overFrameId: string | null, allowed: boolean) {
    if (!allowed || !planRef.current) return;
    applyPlanUpdate(reorderUploadPlan(planRef.current, activeFrameId, overFrameId));
  }

  function renamePairingColumn(column: UploadPlanImageColumn, nextLabel: string, allowed: boolean) {
    if (!allowed || !planRef.current) return;
    applyPlanUpdate(renameUploadPlanAssetLabel(planRef.current, column, nextLabel));
  }

  function changeHeatmapReference(nextLabel: string, allowed: boolean) {
    if (!allowed || !planRef.current) return;
    applyPlanUpdate(setUploadPlanHeatmapReference(planRef.current, nextLabel));
  }

  function changeFrameTitleMode(nextMode: FrameTitleMode, allowed: boolean) {
    if (!allowed || !planRef.current || nextMode === frameTitleMode) return;
    setExpandedFrameId(null);
    setFrameTitleMode(nextMode);
    applyPlanUpdate(setUploadPlanFrameTitleMode(planRef.current, nextMode));
  }

  function resetPlan() {
    invalidatePreflight();
    planRef.current = null;
    setPlanView(null);
    setExpandedFrameId(null);
    setFrameTitleMode("inferred");
  }

  return {
    changeFrameTitleMode,
    changeHeatmapReference,
    chooseDirectory,
    ensurePreflightedFrames,
    expandedFrameId,
    frameTitleMode,
    generationProgress,
    handleFallbackInput,
    inputRef,
    isScanning,
    planRef,
    planView,
    renamePairingColumn,
    reorderPairingRows,
    reportGenerationProgress: setGenerationProgress,
    resetPlan,
    setExpandedFrameId,
    sourceRootName: planRef.current?.sourceRootName ?? null,
  };
}
