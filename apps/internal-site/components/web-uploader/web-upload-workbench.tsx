"use client";

import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowBack,
  CloudUpload,
  DeleteOutline,
  FolderOpen,
  OpenInNew,
  Pause,
  Refresh,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { ViewerMode } from "@magic-compare/content-schema";
import { cjkKebabCase } from "@magic-compare/shared-utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";
import { AppNotifications } from "../notifications/app-notifications";
import { useAppNotifications } from "../notifications/use-app-notifications";
import type { GenerationProgress } from "./asset-generator";
import { scanBrowserUploadFiles } from "./source-scanner";
import { WebUploadRunner } from "./upload-runner";
import {
  webUploadColors,
  webUploadFieldSx,
  webUploadPanelSx,
  webUploadRadii,
  webUploadSizes,
  webUploadSurfaces,
} from "./web-upload-design";
import { PairingPreviewPanel } from "./web-upload-pairing-preview";
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
  setUploadPlanHeatmapReference,
  type PlanView,
} from "./web-upload-view-model";

const DEFAULT_NEW_CASE_SLUG = "new-case";
const DEFAULT_NEW_CASE_TITLE = "New Case";
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

function guessCaseTitle(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCaseInput(
  cases: CaseCatalogItem[],
  selectedCaseSlug: string,
  newCase: { slug: string; title: string; summary: string },
) {
  const existing = cases.find((item) => item.slug === selectedCaseSlug);
  if (existing) {
    return {
      slug: existing.slug,
      title: existing.title,
      summary: existing.summary,
      tags: existing.tags,
      coverAssetLabel: null,
    };
  }

  const slug = normalizeSlug(
    newCase.slug || selectedCaseSlug || DEFAULT_NEW_CASE_SLUG,
    DEFAULT_NEW_CASE_SLUG,
  );
  return {
    slug,
    title: newCase.title.trim() || guessCaseTitle(slug) || DEFAULT_NEW_CASE_TITLE,
    summary: newCase.summary.trim(),
    tags: [],
    coverAssetLabel: null,
  };
}

async function readDirectoryHandle(
  handle: BrowserDirectoryHandle,
): Promise<BrowserUploadFile[]> {
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

function stageLabel(stage: UploadRunnerSnapshot["stage"]) {
  if (stage === "generating") {
    return "生成中";
  }
  if (stage === "uploading") {
    return "上传中";
  }
  if (stage === "completed") {
    return "完成";
  }
  if (stage === "failed") {
    return "失败";
  }
  return "待上传";
}

function UploadQueue({ snapshot }: { snapshot: UploadRunnerSnapshot }) {
  if (snapshot.frames.length === 0) {
    return null;
  }

  return (
    <Stack spacing={0.75}>
      {snapshot.frames.slice(0, UPLOAD_QUEUE_VISIBLE_LIMIT).map((frame) => {
        const progress =
          frame.totalFiles > 0 ? (frame.completedFiles / frame.totalFiles) * 100 : 0;
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
              <Typography variant="caption" color="error.main" sx={{ gridColumn: "1 / -1" }}>
                {frame.error}
              </Typography>
            ) : null}
          </Box>
        );
      })}
      {snapshot.frames.length > UPLOAD_QUEUE_VISIBLE_LIMIT ? (
        <Typography variant="caption" color="text.secondary">
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

function UploadMetric({ label, value, tone = "default" }: {
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
        color="text.secondary"
        sx={{ mt: 0.35, fontSize: { xs: "0.82rem", md: "0.88rem" }, lineHeight: 1.15 }}
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
            {current.marker}
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
export function WebUploadWorkbench({
  cases,
  initialCaseSlug,
}: WebUploadWorkbenchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const planRef = useRef<WebUploadPlan | null>(null);
  const generatedFramesRef = useRef<GeneratedUploadFrame[] | null>(null);
  const runnerRef = useRef<WebUploadRunner | null>(null);
  const unsubscribeRunnerRef = useRef<(() => void) | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const { dismissNotification, notifications, pushNotification } =
    useAppNotifications();
  const [selectedCaseSlug, setSelectedCaseSlug] = useState(() => {
    if (initialCaseSlug && cases.some((item) => item.slug === initialCaseSlug)) {
      return initialCaseSlug;
    }
    return cases[0]?.slug ?? DEFAULT_NEW_CASE_SLUG;
  });
  const [newCase, setNewCase] = useState({
    slug: cases.length === 0 ? DEFAULT_NEW_CASE_SLUG : "",
    title: cases.length === 0 ? DEFAULT_NEW_CASE_TITLE : "",
    summary: "",
  });
  const [groupMeta, setGroupMeta] = useState({
    slug: "uploaded-group",
    title: "Uploaded Group",
    description: "",
    defaultMode: "before-after" as ViewerMode,
  });
  const [planView, setPlanView] = useState<PlanView | null>(null);
  const [generationProgress, setGenerationProgress] =
    useState<GenerationProgress | null>(null);
  const [expandedFrameId, setExpandedFrameId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<UploadRunnerSnapshot>(() =>
    buildInitialSnapshot(),
  );

  // Failed uploads can be resumed against the existing server job. Keep metadata locked there too
  // so visible inputs cannot drift away from the payload already owned by the runner.
  const isLocked =
    snapshot.stage === "generating" ||
    snapshot.stage === "uploading" ||
    snapshot.stage === "paused" ||
    snapshot.stage === "failed";
  const selectedCaseExists = cases.some((item) => item.slug === selectedCaseSlug);
  const hasBlockingIssues = Boolean(planView && planView.errorCount > 0);
  const canStart = Boolean(planView && planRef.current && !hasBlockingIssues);
  const canAbandon =
    Boolean(planRef.current) &&
    snapshot.stage !== "idle" &&
    snapshot.stage !== "completed";
  const overallProgress =
    snapshot.totalFiles > 0 ? (snapshot.completedFiles / snapshot.totalFiles) * 100 : 0;

  const caseOptions = useMemo(
    () => [
      ...cases.map((item) => ({ slug: item.slug, label: item.title })),
      { slug: DEFAULT_NEW_CASE_SLUG, label: "新建 Case" },
    ],
    [cases],
  );

  useEffect(() => {
    pushNotification(BROWSER_RECOMMENDATION_MESSAGE, "info", {
      key: "web-upload-browser-recommendation",
    });
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
      const entries = await readDirectoryHandle(handle);
      applyScannedFiles(entries, handle.name);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      pushNotification(
        error instanceof Error ? error.message : "读取目录失败。",
        "error",
        { key: "web-upload-directory-error" },
      );
    }
  }

  function handleFallbackInput(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const entries = filesFromInput(files);
    const sourceRootName =
      entries[0]?.relativePath.split("/").filter(Boolean)[0] ?? "uploaded-group";
    applyScannedFiles(entries, sourceRootName);
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
      const caseInput = getCaseInput(cases, selectedCaseSlug, newCase);
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

  function renamePairingColumn(currentLabel: string, nextLabel: string) {
    const plan = planRef.current;
    if (!plan || snapshot.stage !== "scanned") {
      return;
    }

    applyPlanUpdate(renameUploadPlanAssetLabel(plan, currentLabel, nextLabel));
  }

  function changeHeatmapReference(nextLabel: string) {
    const plan = planRef.current;
    if (!plan || snapshot.stage !== "scanned") {
      return;
    }

    applyPlanUpdate(setUploadPlanHeatmapReference(plan, nextLabel));
  }

  return (
    <>
      <Stack spacing={{ xs: 3.1, md: 4.2 }}>
        <Stack spacing={1.55} sx={{ width: "100%" }}>
          <Typography variant="overline" color="primary.main">
            Magic Compare Web / Internal
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
              gap: { xs: 1.5, md: 2 },
              alignItems: "end",
              pb: { xs: 2.75, md: 3.4 },
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="h2"
              component="h1"
              sx={{ lineHeight: 1, textWrap: "balance" }}
            >
              上传对比
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent={{ xs: "flex-start", md: "flex-end" }}
              flexWrap="wrap"
              useFlexGap
              sx={{
                // Mirrors Internal Catalog's header grid so the upload action keeps the same
                // visual anchor when users move between the list and the uploader.
                justifySelf: { xs: "start", md: "end" },
                "& .MuiButton-root": {
                  minHeight: 42,
                  px: 2.1,
                },
              }}
            >
              <Button
                component={Link}
                href="/"
                variant="text"
                startIcon={<ArrowBack />}
                sx={{
                  color: "text.secondary",
                  "&:hover": {
                    color: "text.primary",
                    backgroundColor: webUploadSurfaces.buttonHover,
                  },
                }}
              >
                返回
              </Button>
              {snapshot.stage === "uploading" ? (
                <Button variant="outlined" startIcon={<Pause />} onClick={pauseUpload}>
                  暂停
                </Button>
              ) : (
                <Button
                  variant="contained"
                  startIcon={snapshot.stage === "failed" ? <Refresh /> : <CloudUpload />}
                  disabled={
                    !canStart ||
                    snapshot.stage === "generating" ||
                    snapshot.stage === "completed"
                  }
                  onClick={startOrResumeUpload}
                  sx={{
                    color: webUploadColors.primaryButtonText,
                    fontWeight: 650,
                    "&.Mui-disabled": {
                      color: webUploadColors.primaryButtonDisabledText,
                    },
                  }}
                >
                  {snapshot.stage === "paused" || snapshot.stage === "failed"
                    ? "继续上传"
                    : "开始上传"}
                </Button>
              )}
              {canAbandon ? (
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<DeleteOutline />}
                  onClick={abandonUpload}
                >
                  放弃
                </Button>
              ) : null}
              {snapshot.stage === "completed" ? (
                <Button variant="outlined" endIcon={<OpenInNew />} onClick={openCompletedGroup}>
                  打开 Group
                </Button>
              ) : null}
            </Stack>
          </Box>
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(320px, 0.72fr) minmax(0, 1.7fr)" },
            gap: { xs: 1.4, md: 1.6 },
            alignItems: "start",
          }}
        >
          <Stack spacing={1.4}>
            <Paper elevation={0} sx={webUploadPanelSx}>
              <Stack spacing={1.45} sx={webUploadFieldSx}>
                <Typography variant="h6">对比信息</Typography>

                <Button
                  variant="outlined"
                  startIcon={<FolderOpen />}
                  disabled={isLocked}
                  onClick={chooseDirectory}
                  sx={{ borderRadius: 999 }}
                >
                  选择文件夹
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={handleFallbackInput}
                  {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                />

                <FormControl fullWidth size="small">
                  <InputLabel id="web-upload-case-label">目标目录</InputLabel>
                  <Select
                    labelId="web-upload-case-label"
                    label="目标目录"
                    value={selectedCaseSlug}
                    disabled={isLocked}
                    onChange={(event) => setSelectedCaseSlug(event.target.value)}
                  >
                    {caseOptions.map((option) => (
                      <MenuItem key={option.slug} value={option.slug}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {!selectedCaseExists ? (
                  <Stack spacing={1.1}>
                    <TextField
                      label="目录 Slug"
                      size="small"
                      value={newCase.slug}
                      disabled={isLocked}
                      onChange={(event) =>
                        setNewCase((current) => ({
                          ...current,
                          slug: normalizeSlug(event.target.value, DEFAULT_NEW_CASE_SLUG),
                        }))
                      }
                    />
                    <TextField
                      label="目录标题"
                      size="small"
                      value={newCase.title}
                      disabled={isLocked}
                      onChange={(event) =>
                        setNewCase((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                    <TextField
                      label="目录描述"
                      size="small"
                      multiline
                      minRows={2}
                      value={newCase.summary}
                      disabled={isLocked}
                      onChange={(event) =>
                        setNewCase((current) => ({ ...current, summary: event.target.value }))
                      }
                    />
                  </Stack>
                ) : null}

                <TextField
                  label="Slug"
                  size="small"
                  value={groupMeta.slug}
                  disabled={isLocked}
                  onChange={(event) =>
                    setGroupMeta((current) => ({
                      ...current,
                      slug: normalizeSlug(event.target.value),
                    }))
                  }
                />
                <TextField
                  label="标题"
                  size="small"
                  value={groupMeta.title}
                  disabled={isLocked}
                  onChange={(event) =>
                    setGroupMeta((current) => ({ ...current, title: event.target.value }))
                  }
                />
                <TextField
                  label="描述"
                  size="small"
                  multiline
                  minRows={2}
                  value={groupMeta.description}
                  disabled={isLocked}
                  onChange={(event) =>
                    setGroupMeta((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Stack>
            </Paper>

            <Paper elevation={0} sx={webUploadPanelSx}>
              <Stack spacing={1.35}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Typography variant="h6">上传详情</Typography>
                  <Chip
                    label={stageLabel(snapshot.stage)}
                    color={
                      snapshot.stage === "completed"
                        ? "primary"
                        : snapshot.stage === "failed"
                          ? "warning"
                          : "default"
                    }
                    sx={{ height: webUploadSizes.compactControlHeight }}
                  />
                </Stack>

                <UploadDetails
                  generationProgress={generationProgress}
                  overallProgress={overallProgress}
                  planView={planView}
                  snapshot={snapshot}
                />
              </Stack>
            </Paper>
          </Stack>

          <PairingPreviewPanel
            plan={planRef.current}
            planView={planView}
            canReorder={snapshot.stage === "scanned"}
            expandedFrameId={expandedFrameId}
            hasBlockingIssues={hasBlockingIssues}
            onExpandedFrameChange={setExpandedFrameId}
            onHeatmapReferenceChange={changeHeatmapReference}
            onRenameColumn={renamePairingColumn}
            onReorder={reorderPairingRows}
          />
        </Box>
      </Stack>
      <AppNotifications notifications={notifications} onDismiss={dismissNotification} />
    </>
  );
}
