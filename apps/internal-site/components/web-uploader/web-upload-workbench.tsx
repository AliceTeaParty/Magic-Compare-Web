"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import {
  CheckCircleOutlined,
  CloudUpload,
  DeleteOutlined,
  FolderOpen,
  HourglassTop,
  MoreVert,
  OpenInNew,
  Pause,
  Refresh,
  WarningAmber,
} from "@mui/icons-material";
import {
  Box,
  Button,
  IconButton,
  LinearProgress,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { cjkKebabCase } from "@magic-compare/shared-utils";
import { useRouter } from "next/navigation";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";
import { InternalPageHeader } from "../internal-page-shell";
import { useAppNotifications } from "../notifications/use-app-notifications";
import type { GenerationProgress } from "./asset-generator";
import { scanBrowserUploadFiles } from "./source-scanner";
import { WebUploadRunner } from "./upload-runner";
import {
  webUploadPanelSx,
  webUploadRadii,
  webUploadSizes,
  webUploadSurfaces,
} from "./web-upload-design";
import { PairingPreviewPanel } from "./web-upload-pairing-preview";
import {
  UploadConfigurationPanel,
  UploadFlowStrip,
  UploadIntakePanel,
  type UploadGroupMeta,
} from "./web-upload-workspace-sections";
import type {
  BrowserUploadFile,
  GeneratedUploadFrame,
  UploadRunnerSnapshot,
  WebUploadPlan,
} from "./web-upload-types";
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

const INPUT_HASH_STORAGE_PREFIX = "magic_compare_web_upload:";
const UPLOAD_QUEUE_VISIBLE_LIMIT = 12;
const BROWSER_RECOMMENDATION_MESSAGE = "推荐使用 Chrome / Edge 选择整个目录上传。";

interface WebUploadWorkbenchProps {
  cases: CaseCatalogItem[];
  initialCaseSlug: string | null;
}

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

function normalizeSlug(value: string, fallback = "uploaded-group") {
  return cjkKebabCase(value, fallback);
}

function buildInitialSnapshot(): UploadRunnerSnapshot {
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

function getCaseInput(cases: CaseCatalogItem[], selectedCaseSlug: string) {
  const existing = cases.find((item) => item.slug === selectedCaseSlug);
  if (!existing) throw new Error("请先新建并选择目标 Case。");
  return {
    slug: existing.slug,
    title: existing.title,
    summary: existing.summary,
    tags: existing.tags,
    coverAssetLabel: null,
  };
}

async function readDirectoryHandle(handle: BrowserDirectoryHandle): Promise<BrowserUploadFile[]> {
  const entries: BrowserUploadFile[] = [];

  async function walk(directory: BrowserDirectoryHandle, prefix: string) {
    for await (const entry of directory.values()) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "file") {
        entries.push({
          relativePath,
          file: await entry.getFile(),
        });
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
 * Upload resume hints are helpful but optional; blocked storage must not break the live upload
 * runner after frames have already been generated.
 */
function writeUploadResumeHint(groupSlug: string, inputHash: string) {
  try {
    window.localStorage.setItem(`${INPUT_HASH_STORAGE_PREFIX}${groupSlug}`, inputHash);
  } catch {
    // Browser privacy settings can disable storage. The active runner still owns this session.
  }
}

function removeUploadResumeHint(groupSlug: string) {
  try {
    window.localStorage.removeItem(`${INPUT_HASH_STORAGE_PREFIX}${groupSlug}`);
  } catch {
    // Storage is optional for uploads; inability to clear a hint must not block abandonment.
  }
}

function UploadStageIcon({ marker }: { marker: string }) {
  if (marker === "!") return <WarningAmber fontSize="small" />;
  if (marker === "✓") return <CheckCircleOutlined fontSize="small" />;
  if (marker === "◐") return <HourglassTop fontSize="small" />;
  if (marker === "↑") return <CloudUpload fontSize="small" />;
  return <FolderOpen fontSize="small" />;
}

function UploadQueue({ snapshot }: { snapshot: UploadRunnerSnapshot }) {
  if (snapshot.frames.length === 0) {
    return null;
  }

  return (
    <Stack spacing={0.75}>
      {snapshot.frames.slice(0, UPLOAD_QUEUE_VISIBLE_LIMIT).map((frame) => {
        const progress = frame.totalFiles > 0 ? (frame.completedFiles / frame.totalFiles) * 100 : 0;
        return (
          <Box
            key={frame.frameOrder}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "minmax(0, 1fr) 78px minmax(105px, 0.5fr)",
              },
              gap: 0.9,
              alignItems: "center",
              px: 1,
              py: 0.8,
              borderRadius: webUploadRadii.item,
              backgroundColor: webUploadSurfaces.row,
            }}
          >
            <Typography variant="body2" noWrap title={frame.title}>
              {frame.title}
            </Typography>
            <Typography
              variant="caption"
              color={frame.status === "failed" ? "error.main" : "text.secondary"}
              sx={{ textTransform: "capitalize" }}
            >
              {frame.status}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progress}
              color={frame.status === "failed" ? "error" : "primary"}
              sx={{ height: webUploadSizes.progressHeight, borderRadius: 999 }}
            />
            {frame.error ? (
              <Typography
                variant="caption"
                sx={{
                  color: "error.main",
                  gridColumn: "1 / -1",
                }}
              >
                {frame.error}
              </Typography>
            ) : null}
          </Box>
        );
      })}
      {snapshot.frames.length > UPLOAD_QUEUE_VISIBLE_LIMIT ? (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
          }}
        >
          仅显示前 {UPLOAD_QUEUE_VISIBLE_LIMIT} 项；其余{" "}
          {snapshot.frames.length - UPLOAD_QUEUE_VISIBLE_LIMIT} 个 frame 会继续上传。
        </Typography>
      ) : null}
    </Stack>
  );
}

function uploadStageCopy({
  generationProgress,
  overallProgress,
  planView,
  snapshot,
}: {
  generationProgress: GenerationProgress | null;
  overallProgress: number;
  planView: PlanView | null;
  snapshot: UploadRunnerSnapshot;
}) {
  if (snapshot.stage === "generating") {
    return {
      marker: "◐",
      title: "正在准备资源",
      detail: generationProgress
        ? `${generationProgress.completed}/${generationProgress.total} · ${generationProgress.label}`
        : "生成缩略图与 heatmap",
      progress:
        generationProgress && generationProgress.total > 0
          ? (generationProgress.completed / generationProgress.total) * 100
          : 0,
    };
  }

  if (snapshot.stage === "uploading") {
    return {
      marker: "↑",
      title: "正在上传",
      detail:
        snapshot.totalFrames > 0
          ? `${snapshot.completedFrames}/${snapshot.totalFrames} frames · ${Math.round(overallProgress)}%`
          : "等待文件队列",
      progress: overallProgress,
    };
  }

  if (snapshot.stage === "paused") {
    return {
      marker: "◐",
      title: "已暂停",
      detail:
        snapshot.totalFrames > 0
          ? `${snapshot.completedFrames}/${snapshot.totalFrames} frames · ${Math.round(overallProgress)}%`
          : "等待继续",
      progress: overallProgress,
    };
  }

  if (snapshot.stage === "completed") {
    return {
      marker: "✓",
      title: "上传完成",
      detail: `${snapshot.completedFrames}/${snapshot.totalFrames} frames 已提交`,
      progress: 100,
    };
  }

  if (snapshot.stage === "failed") {
    return {
      marker: "!",
      title: "需要处理",
      detail: snapshot.message || "部分项目未完成",
      progress: overallProgress,
    };
  }

  if (planView) {
    return {
      marker: planView.errorCount > 0 ? "!" : "✓",
      title: planView.errorCount > 0 ? "需要修正" : "检查完成",
      detail:
        planView.errorCount > 0
          ? `${planView.errorCount} 个问题阻止上传`
          : `${planView.healthyPairCount}/${planView.frames.length} 项可上传`,
      progress: planView.frames.length > 0 ? 100 : 0,
    };
  }

  return {
    marker: "○",
    title: "待选目录",
    detail: "",
    progress: 0,
  };
}

function UploadMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warning";
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        color: tone === "warning" ? "warning.main" : "text.primary",
      }}
    >
      <Typography
        variant="h6"
        component="div"
        sx={{
          lineHeight: 1,
          fontWeight: 750,
          fontSize: { xs: "1.12rem", md: "1.22rem" },
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          mt: 0.35,
          fontSize: { xs: "0.82rem", md: "0.88rem" },
          lineHeight: 1.15,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function UploadDetails({
  generationProgress,
  overallProgress,
  planView,
  snapshot,
}: {
  generationProgress: GenerationProgress | null;
  overallProgress: number;
  planView: PlanView | null;
  snapshot: UploadRunnerSnapshot;
}) {
  const current = uploadStageCopy({
    generationProgress,
    overallProgress,
    planView,
    snapshot,
  });

  return (
    <Stack spacing={1.45}>
      <Box
        aria-live="polite"
        sx={{
          minWidth: 0,
        }}
      >
        {/* The panel heading already says "上传详情"; the live state stays to one compact row
            so the empty state does not read like a second title block. */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.9, minWidth: 0 }}>
          <Box
            aria-hidden="true"
            sx={{
              flex: "0 0 auto",
              width: webUploadSizes.statusMarker,
              height: webUploadSizes.statusMarker,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              color: current.marker === "!" ? "warning.main" : "primary.main",
              backgroundColor: webUploadSurfaces.controlBackground,
              fontSize: "0.9rem",
              fontWeight: 800,
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            <UploadStageIcon marker={current.marker} />
          </Box>
          <Typography
            variant="body2"
            noWrap
            title={current.detail ? `${current.title} · ${current.detail}` : current.title}
            sx={{ minWidth: 0, color: "text.primary", fontWeight: 700 }}
          >
            {current.title}
            {current.detail ? (
              <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>
                {" "}
                · {current.detail}
              </Box>
            ) : null}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={current.progress}
          sx={{
            mt: 1.15,
            height: webUploadSizes.progressHeight,
            borderRadius: 999,
            backgroundColor: webUploadSurfaces.progressTrack,
          }}
        />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: { xs: 1.2, md: 1.45 },
            mt: 1.35,
          }}
        >
          <UploadMetric label="可用" value={planView?.healthyPairCount ?? 0} />
          <UploadMetric
            label="问题"
            value={planView?.errorCount ?? 0}
            tone={planView?.errorCount ? "warning" : "default"}
          />
          <UploadMetric label="忽略" value={planView?.ignoredCount ?? 0} />
        </Box>
      </Box>

      <UploadQueue snapshot={snapshot} />
    </Stack>
  );
}

/**
 * Presents upload as a focused workbench. Heavy File/Blob data stays in refs and the upload runner;
 * React only keeps compact render models so large directories do not become component state.
 */
export function WebUploadWorkbench({ cases, initialCaseSlug }: WebUploadWorkbenchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const planRef = useRef<WebUploadPlan | null>(null);
  const generatedFramesRef = useRef<GeneratedUploadFrame[] | null>(null);
  const runnerRef = useRef<WebUploadRunner | null>(null);
  const unsubscribeRunnerRef = useRef<(() => void) | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const { pushNotification } = useAppNotifications();
  const [selectedCaseSlug, setSelectedCaseSlug] = useState(() => {
    if (initialCaseSlug && cases.some((item) => item.slug === initialCaseSlug)) {
      return initialCaseSlug;
    }
    return cases[0]?.slug ?? "";
  });
  const [actionMenuAnchor, setActionMenuAnchor] = useState<HTMLElement | null>(null);
  const [groupMeta, setGroupMeta] = useState<UploadGroupMeta>({
    slug: "uploaded-group",
    title: "Uploaded Group",
    description: "",
    defaultMode: "before-after",
  });
  const [planView, setPlanView] = useState<PlanView | null>(null);
  const [frameTitleMode, setFrameTitleMode] = useState<FrameTitleMode>("inferred");
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [expandedFrameId, setExpandedFrameId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [snapshot, setSnapshot] = useState<UploadRunnerSnapshot>(() => buildInitialSnapshot());

  // Failed uploads can be resumed against the existing server job. Keep metadata locked there too
  // so visible inputs cannot drift away from the payload already owned by the runner.
  const isLocked =
    isScanning ||
    snapshot.stage === "generating" ||
    snapshot.stage === "uploading" ||
    snapshot.stage === "paused" ||
    snapshot.stage === "failed";
  const selectedCaseExists = cases.some((item) => item.slug === selectedCaseSlug);
  // Preserve the workspace that opened upload; a fixed catalog link discarded the operator's
  // current Case context when they returned without uploading.
  const returnCaseSlug =
    initialCaseSlug && cases.some((item) => item.slug === initialCaseSlug) ? initialCaseSlug : null;
  const returnHref = returnCaseSlug ? `/cases/${encodeURIComponent(returnCaseSlug)}` : "/";
  const hasBlockingIssues = Boolean(planView && planView.errorCount > 0);
  const canStart = Boolean(selectedCaseExists && planView && planRef.current && !hasBlockingIssues);
  const canAbandon =
    Boolean(planRef.current) && snapshot.stage !== "idle" && snapshot.stage !== "completed";
  const sourceRootName = planRef.current?.sourceRootName ?? null;
  const showProgressPanel = snapshot.stage !== "idle" && snapshot.stage !== "scanned";
  const overallProgress =
    snapshot.totalFiles > 0 ? (snapshot.completedFiles / snapshot.totalFiles) * 100 : 0;

  useEffect(() => {
    // Browser guidance is contextual: Chromium users already have the preferred directory picker,
    // so showing the recommendation on every visit only covers useful upload information.
    if (!(window as DirectoryPickerWindow).showDirectoryPicker) {
      pushNotification(BROWSER_RECOMMENDATION_MESSAGE, "info", {
        key: "web-upload-browser-recommendation",
      });
    }
  }, [pushNotification]);

  useEffect(() => {
    return () => {
      generationAbortRef.current?.abort();
      unsubscribeRunnerRef.current?.();
      runnerRef.current?.dispose();
    };
  }, []);

  /**
   * Runs the scanner and stores the heavy plan outside React state; the component receives only a
   * compact render model. Row previews create object URLs lazily inside the expanded row.
   */
  function applyScannedFiles(entries: BrowserUploadFile[], sourceRootName: string) {
    const plan = scanBrowserUploadFiles(entries, sourceRootName);
    planRef.current = plan;
    generatedFramesRef.current = null;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    runnerRef.current?.dispose();
    runnerRef.current = null;
    unsubscribeRunnerRef.current?.();
    unsubscribeRunnerRef.current = null;
    setSnapshot({ ...buildInitialSnapshot(), stage: "scanned" });
    setGenerationProgress(null);
    setExpandedFrameId(null);
    setFrameTitleMode("inferred");
    setGroupMeta((current) => ({
      ...current,
      // Choosing a new directory starts a new upload intent. Refresh the inferred identity so a
      // previous folder's auto-filled slug/title cannot silently leak into the next upload.
      slug: plan.suggestedGroupSlug,
      title: plan.suggestedGroupTitle,
    }));
    setPlanView(buildPlanView(plan));
    pushNotification(
      plan.issues.some((issue) => issue.severity === "error")
        ? "检查发现阻塞问题，请先修正文件夹。"
        : "检查完成，可以开始上传。",
      plan.issues.some((issue) => issue.severity === "error") ? "warning" : "success",
      { key: "web-upload-scan-result" },
    );
  }

  async function chooseDirectory() {
    if (isLocked) {
      return;
    }

    const picker = window as DirectoryPickerWindow;
    if (!picker.showDirectoryPicker) {
      inputRef.current?.click();
      return;
    }

    try {
      const handle = await picker.showDirectoryPicker();
      setIsScanning(true);
      const entries = await readDirectoryHandle(handle);
      applyScannedFiles(entries, handle.name);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      pushNotification(error instanceof Error ? error.message : "读取目录失败。", "error", {
        key: "web-upload-directory-error",
      });
    } finally {
      setIsScanning(false);
    }
  }

  function handleFallbackInput(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    setIsScanning(true);
    try {
      const entries = filesFromInput(files);
      const sourceRootName =
        entries[0]?.relativePath.split("/").filter(Boolean)[0] ?? "uploaded-group";
      applyScannedFiles(entries, sourceRootName);
    } catch (error) {
      pushNotification(error instanceof Error ? error.message : "读取目录失败。", "error", {
        key: "web-upload-directory-error",
      });
    } finally {
      setIsScanning(false);
    }
    event.target.value = "";
  }

  async function ensureGeneratedFrames() {
    const plan = planRef.current;
    if (!plan) {
      throw new Error("请先选择文件夹。");
    }

    if (generatedFramesRef.current) {
      return generatedFramesRef.current;
    }

    const abortController = new AbortController();
    generationAbortRef.current = abortController;
    setSnapshot({ ...buildInitialSnapshot(), stage: "generating", message: "正在生成资源。" });
    const { generateUploadFrames } = await import("./asset-generator");
    const frames = await generateUploadFrames(
      plan.frames,
      (progress) => {
        setGenerationProgress(progress);
      },
      {
        generateMissingHeatmap: true,
        heatmapReferenceLabel: plan.heatmapReferenceLabel,
        signal: abortController.signal,
      },
    );
    if (abortController.signal.aborted) {
      throw new DOMException("Upload generation was abandoned.", "AbortError");
    }
    generationAbortRef.current = null;
    generatedFramesRef.current = frames;
    setSnapshot({ ...buildInitialSnapshot(), stage: "ready", message: "资源生成完成。" });
    return frames;
  }

  async function startOrResumeUpload() {
    if (!canStart) {
      return;
    }

    try {
      const frames = await ensureGeneratedFrames();
      const caseInput = getCaseInput(cases, selectedCaseSlug);
      const runner =
        runnerRef.current ??
        new WebUploadRunner({
          caseInput,
          groupInput: {
            slug: normalizeSlug(groupMeta.slug),
            title: groupMeta.title.trim() || "Uploaded Group",
            description: groupMeta.description.trim(),
            defaultMode: groupMeta.defaultMode,
            order: 0,
            tags: [],
          },
          frames,
        });

      if (!runnerRef.current) {
        runnerRef.current = runner;
        unsubscribeRunnerRef.current = runner.subscribe((nextSnapshot) => {
          setSnapshot(nextSnapshot);
          if (nextSnapshot.inputHash) {
            writeUploadResumeHint(
              nextSnapshot.result?.groupSlug ?? groupMeta.slug,
              nextSnapshot.inputHash,
            );
          }
        });
      }

      await runner.start();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      pushNotification(error instanceof Error ? error.message : "上传失败。", "error", {
        key: "web-upload-runner-error",
      });
      setSnapshot({
        ...buildInitialSnapshot(),
        stage: "failed",
        message: error instanceof Error ? error.message : "上传失败。",
      });
    }
  }

  function pauseUpload() {
    runnerRef.current?.pause();
  }

  function resetLocalUploadState() {
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    unsubscribeRunnerRef.current?.();
    unsubscribeRunnerRef.current = null;
    runnerRef.current?.dispose();
    runnerRef.current = null;
    planRef.current = null;
    generatedFramesRef.current = null;
    setPlanView(null);
    setGenerationProgress(null);
    setExpandedFrameId(null);
    setFrameTitleMode("inferred");
    setSnapshot(buildInitialSnapshot());
  }

  async function abandonUpload() {
    if (!canAbandon) {
      return;
    }

    const runner = runnerRef.current;
    try {
      generationAbortRef.current?.abort();
      if (runner) {
        await runner.cancel();
      }
      removeUploadResumeHint(groupMeta.slug);
      resetLocalUploadState();
      pushNotification("已放弃上传。", "info", { key: "web-upload-abandoned" });
    } catch (error) {
      pushNotification(error instanceof Error ? error.message : "放弃上传失败。", "error", {
        key: "web-upload-abandon-error",
      });
    }
  }

  function openCompletedGroup() {
    const result = snapshot.result;
    if (!result) {
      return;
    }

    router.push(`/cases/${result.caseSlug}/groups/${result.groupSlug}`);
  }

  function reorderPairingRows(activeFrameId: string, overFrameId: string | null) {
    if (snapshot.stage !== "scanned") {
      return;
    }

    const plan = planRef.current;
    if (!plan) {
      return;
    }

    const reorderedPlan = reorderUploadPlan(plan, activeFrameId, overFrameId);
    if (!reorderedPlan) {
      return;
    }

    planRef.current = reorderedPlan;
    // Generated blobs embed frame order in upload descriptors, so any pre-upload reorder must
    // invalidate cached generation output before the user starts the final upload.
    generatedFramesRef.current = null;
    setPlanView(buildPlanView(reorderedPlan));
  }

  function applyPlanUpdate(nextPlan: WebUploadPlan | null) {
    if (!nextPlan) {
      return;
    }

    planRef.current = nextPlan;
    // Generated blobs carry asset labels and heatmap descriptors, so any metadata-level plan edit
    // before upload must invalidate the cached generation output.
    generatedFramesRef.current = null;
    setPlanView(buildPlanView(nextPlan));
  }

  function renamePairingColumn(column: UploadPlanImageColumn, nextLabel: string) {
    const plan = planRef.current;
    if (!plan || snapshot.stage !== "scanned") {
      return;
    }

    applyPlanUpdate(renameUploadPlanAssetLabel(plan, column, nextLabel));
  }

  function changeHeatmapReference(nextLabel: string) {
    const plan = planRef.current;
    if (!plan || snapshot.stage !== "scanned") {
      return;
    }

    applyPlanUpdate(setUploadPlanHeatmapReference(plan, nextLabel));
  }

  function changeFrameTitleMode(nextMode: FrameTitleMode) {
    const plan = planRef.current;
    if (!plan || snapshot.stage !== "scanned" || nextMode === frameTitleMode) {
      return;
    }

    // Structured recognition stays the efficient default, while filename mode is an explicit
    // recovery path when episode/source-marker inference does not match the operator's naming.
    setExpandedFrameId(null);
    setFrameTitleMode(nextMode);
    applyPlanUpdate(setUploadPlanFrameTitleMode(plan, nextMode));
  }

  return (
    <>
      <Stack spacing={{ xs: 1.5, md: 2 }}>
        <InternalPageHeader
          backHref={returnHref}
          title="上传对比"
          subtitle={
            sourceRootName && planView
              ? `${sourceRootName} · ${planView.frames.length} Frame`
              : "未选择素材"
          }
          actions={
            <>
              {!planView ? (
                <Box aria-hidden="true" sx={{ width: 140, height: 40 }} />
              ) : snapshot.stage === "completed" ? (
                <Button
                  variant="contained"
                  endIcon={<OpenInNew />}
                  onClick={openCompletedGroup}
                  sx={{ minWidth: 140 }}
                >
                  打开 Group
                </Button>
              ) : snapshot.stage === "uploading" ? (
                <Button
                  variant="contained"
                  startIcon={<Pause />}
                  onClick={pauseUpload}
                  sx={{ minWidth: 140 }}
                >
                  暂停上传
                </Button>
              ) : (
                <Button
                  variant="contained"
                  startIcon={snapshot.stage === "failed" ? <Refresh /> : <CloudUpload />}
                  disabled={!canStart}
                  loading={snapshot.stage === "generating"}
                  onClick={startOrResumeUpload}
                  sx={{ minWidth: 140 }}
                >
                  {snapshot.stage === "generating"
                    ? "正在准备"
                    : snapshot.stage === "paused" || snapshot.stage === "failed"
                      ? "继续上传"
                      : "开始上传"}
                </Button>
              )}
              <Box
                aria-hidden={!canAbandon}
                sx={{
                  // The menu owns a fixed slot after the primary action, so it can become available
                  // without moving the upload button or leaving a leading gap in the mobile header.
                  width: 40,
                  height: 40,
                  flex: "0 0 auto",
                  visibility: canAbandon ? "visible" : "hidden",
                  pointerEvents: canAbandon ? "auto" : "none",
                }}
              >
                <IconButton
                  aria-label="上传操作"
                  tabIndex={canAbandon ? 0 : -1}
                  disabled={!canAbandon}
                  onClick={(event) => setActionMenuAnchor(event.currentTarget)}
                >
                  <MoreVert />
                </IconButton>
              </Box>
              <Menu
                anchorEl={actionMenuAnchor}
                open={Boolean(actionMenuAnchor) && canAbandon}
                onClose={() => setActionMenuAnchor(null)}
              >
                <MenuItem
                  disabled={!canAbandon}
                  onClick={() => {
                    setActionMenuAnchor(null);
                    void abandonUpload();
                  }}
                >
                  <ListItemIcon>
                    <DeleteOutlined fontSize="small" />
                  </ListItemIcon>
                  放弃本次上传
                </MenuItem>
              </Menu>
            </>
          }
        />

        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={handleFallbackInput}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />

        <UploadFlowStrip
          generationProgress={generationProgress}
          overallProgress={overallProgress}
          planView={planView}
          snapshot={snapshot}
          sourceRootName={sourceRootName}
        />

        {!planView ? (
          <UploadIntakePanel
            cases={cases}
            isScanning={isScanning}
            selectedCaseSlug={selectedCaseSlug}
            onCaseChange={setSelectedCaseSlug}
            onChooseDirectory={() => void chooseDirectory()}
          />
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "304px minmax(0, 1fr)" },
              gap: { xs: 1.5, md: 2 },
              alignItems: "start",
              minWidth: 0,
            }}
          >
            <Stack
              spacing={1.5}
              sx={{
                minWidth: 0,
                position: { lg: "sticky" },
                top: { lg: 16 },
              }}
            >
              {showProgressPanel ? (
                <Paper elevation={0} sx={webUploadPanelSx}>
                  <Stack spacing={1.35}>
                    <Typography component="h2" variant="h4">
                      进度
                    </Typography>
                    <UploadDetails
                      generationProgress={generationProgress}
                      overallProgress={overallProgress}
                      planView={planView}
                      snapshot={snapshot}
                    />
                  </Stack>
                </Paper>
              ) : null}

              <UploadConfigurationPanel
                cases={cases}
                groupMeta={groupMeta}
                isLocked={isLocked}
                selectedCaseSlug={selectedCaseSlug}
                sourceRootName={sourceRootName ?? groupMeta.title}
                onCaseChange={setSelectedCaseSlug}
                onChooseDirectory={() => void chooseDirectory()}
                onGroupMetaChange={(nextMeta) =>
                  setGroupMeta({ ...nextMeta, slug: normalizeSlug(nextMeta.slug) })
                }
              />
            </Stack>

            <PairingPreviewPanel
              plan={planRef.current}
              planView={planView}
              canReorder={snapshot.stage === "scanned"}
              expandedFrameId={expandedFrameId}
              frameTitleMode={frameTitleMode}
              hasBlockingIssues={hasBlockingIssues}
              onExpandedFrameChange={setExpandedFrameId}
              onFrameTitleModeChange={changeFrameTitleMode}
              onHeatmapReferenceChange={changeHeatmapReference}
              onRenameColumn={renamePairingColumn}
              onReorder={reorderPairingRows}
            />
          </Box>
        )}
      </Stack>
    </>
  );
}
