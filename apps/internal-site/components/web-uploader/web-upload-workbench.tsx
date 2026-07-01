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
import { kebabCase } from "@magic-compare/shared-utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";
import { AppNotifications } from "../notifications/app-notifications";
import { useAppNotifications } from "../notifications/use-app-notifications";
import { generateUploadFrames, type GenerationProgress } from "./asset-generator";
import { scanBrowserUploadFiles } from "./source-scanner";
import { WebUploadRunner } from "./upload-runner";
import { PairingPreviewPanel } from "./web-upload-pairing-preview";
import type {
  BrowserUploadFile,
  GeneratedUploadFrame,
  UploadRunnerSnapshot,
  WebUploadPlan,
} from "./web-upload-types";
import {
  buildPlanView,
  reorderUploadPlan,
  type PlanView,
} from "./web-upload-view-model";

const DEFAULT_NEW_CASE_SLUG = "new-case";
const DEFAULT_NEW_CASE_TITLE = "New Case";
const INPUT_HASH_STORAGE_PREFIX = "magic_compare_web_upload:";
const UPLOAD_QUEUE_VISIBLE_LIMIT = 12;
const BROWSER_RECOMMENDATION_MESSAGE = "推荐使用 Chrome / Edge 选择整个目录上传。";
const UPLOAD_PRIMARY_TEXT = "rgba(24, 15, 31, 0.92)";

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

const panelSx = {
  p: { xs: 1.7, md: 2 },
  borderRadius: 3,
  border: "1px solid",
  borderColor: "divider",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)",
};

const uploadFieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: 1.5,
  },
  "& .MuiOutlinedInput-root.MuiInputBase-multiline": {
    borderRadius: 1.5,
  },
};

function normalizeSlug(value: string, fallback = "uploaded-group") {
  return kebabCase(value) || fallback;
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
    message: "选择文件夹后开始预演。",
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

function ModeLabel({ value }: { value: ViewerMode }) {
  const label =
    value === "before-after" ? "滑动对比" : value === "a-b" ? "A/B" : "热力图";
  return <>{label}</>;
}

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <Chip
      label={`${label} ${value}`}
      variant="outlined"
      sx={{ height: 32, "& .MuiChip-label": { px: 1.2 } }}
    />
  );
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
    return (
      <Typography color="text.secondary" sx={{ py: 1.2 }}>
        等待上传。
      </Typography>
    );
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
              borderRadius: 1.25,
              backgroundColor: "rgba(255,255,255,0.035)",
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
              sx={{ height: 6, borderRadius: 999 }}
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

function UploadProgress({
  generationProgress,
  overallProgress,
  snapshot,
}: {
  generationProgress: GenerationProgress | null;
  overallProgress: number;
  snapshot: UploadRunnerSnapshot;
}) {
  return (
    <Stack spacing={1.35}>
      {generationProgress ? (
        <Box>
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <Typography variant="body2">{generationProgress.label}</Typography>
            <Typography variant="body2" color="text.secondary">
              {generationProgress.completed}/{generationProgress.total}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={(generationProgress.completed / generationProgress.total) * 100}
            sx={{ mt: 0.8, height: 7, borderRadius: 999 }}
          />
        </Box>
      ) : null}

      {snapshot.totalFiles > 0 ? (
        <Box>
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <Typography variant="body2">
              {snapshot.completedFrames}/{snapshot.totalFrames} frames committed
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {Math.round(overallProgress)}%
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={overallProgress}
            sx={{ mt: 0.8, height: 7, borderRadius: 999 }}
          />
        </Box>
      ) : null}

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

  const isLocked =
    snapshot.stage === "generating" ||
    snapshot.stage === "uploading" ||
    snapshot.stage === "paused";
  const selectedCaseExists = cases.some((item) => item.slug === selectedCaseSlug);
  const hasBlockingIssues = Boolean(planView && planView.errorCount > 0);
  const canStart = Boolean(planView && planRef.current && !hasBlockingIssues);
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
    runnerRef.current?.dispose();
    runnerRef.current = null;
    unsubscribeRunnerRef.current?.();
    unsubscribeRunnerRef.current = null;
    setSnapshot({ ...buildInitialSnapshot(), stage: "scanned" });
    setGenerationProgress(null);
    setExpandedFrameId(null);
    setGroupMeta((current) => ({
      ...current,
      slug: current.slug === "uploaded-group" ? plan.suggestedGroupSlug : current.slug,
      title:
        current.title === "Uploaded Group" ? plan.suggestedGroupTitle : current.title,
    }));
    setPlanView(buildPlanView(plan));
    pushNotification(
      plan.issues.some((issue) => issue.severity === "error")
        ? "预演发现阻塞问题，请先修正文件夹。"
        : "预演完成，可以开始上传。",
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

    setSnapshot({ ...buildInitialSnapshot(), stage: "generating", message: "正在生成资源。" });
    const frames = await generateUploadFrames(
      plan.frames,
      (progress) => {
        setGenerationProgress(progress);
      },
      { generateMissingHeatmap: true },
    );
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

  return (
    <>
      <Stack spacing={{ xs: 1.8, md: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
          spacing={1.2}
        >
          <Typography
            variant="h4"
            component="h1"
            sx={{ lineHeight: 1.05, fontSize: { xs: "2rem", md: "2.35rem" } }}
          >
            上传对比
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button component={Link} href="/" variant="text" startIcon={<ArrowBack />}>
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
                  color: UPLOAD_PRIMARY_TEXT,
                  fontWeight: 650,
                  "&.Mui-disabled": {
                    color: "rgba(24, 15, 31, 0.46)",
                  },
                }}
              >
                {snapshot.stage === "paused" || snapshot.stage === "failed"
                  ? "继续上传"
                  : "开始上传"}
              </Button>
            )}
            {snapshot.stage === "completed" ? (
              <Button variant="outlined" endIcon={<OpenInNew />} onClick={openCompletedGroup}>
                打开 Group
              </Button>
            ) : null}
          </Stack>
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
            <Paper elevation={0} sx={panelSx}>
              <Stack spacing={1.45} sx={uploadFieldSx}>
                <Typography variant="h6">对比信息</Typography>

                <FormControl fullWidth size="small">
                  <InputLabel id="web-upload-case-label">目标 Case</InputLabel>
                  <Select
                    labelId="web-upload-case-label"
                    label="目标 Case"
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
                      label="Case slug"
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
                      label="Case 标题"
                      size="small"
                      value={newCase.title}
                      disabled={isLocked}
                      onChange={(event) =>
                        setNewCase((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                    <TextField
                      label="Case 描述"
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
                  label="Group slug"
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
                  label="Group 标题"
                  size="small"
                  value={groupMeta.title}
                  disabled={isLocked}
                  onChange={(event) =>
                    setGroupMeta((current) => ({ ...current, title: event.target.value }))
                  }
                />
                <TextField
                  label="Group 描述"
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
                <FormControl fullWidth size="small">
                  <InputLabel id="web-upload-mode-label">默认对比模式</InputLabel>
                  <Select
                    labelId="web-upload-mode-label"
                    label="默认对比模式"
                    value={groupMeta.defaultMode}
                    disabled={isLocked}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "before-after" || value === "a-b" || value === "heatmap") {
                        setGroupMeta((current) => ({ ...current, defaultMode: value }));
                      }
                    }}
                  >
                    {(["before-after", "a-b", "heatmap"] as ViewerMode[]).map((mode) => (
                      <MenuItem key={mode} value={mode}>
                        <ModeLabel value={mode} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Paper>

            <Paper elevation={0} sx={panelSx}>
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
                    sx={{ height: 32 }}
                  />
                </Stack>

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

                <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                  <StatChip label="Frames" value={planView?.frames.length ?? 0} />
                  <StatChip label="忽略" value={planView?.ignoredCount ?? 0} />
                  <StatChip label="问题" value={planView?.errorCount ?? 0} />
                </Stack>

                <UploadProgress
                  generationProgress={generationProgress}
                  overallProgress={overallProgress}
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
            onReorder={reorderPairingRows}
          />
        </Box>
      </Stack>
      <AppNotifications notifications={notifications} onDismiss={dismissNotification} />
    </>
  );
}
