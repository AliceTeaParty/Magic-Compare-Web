"use client";

import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowBack,
  CheckCircle,
  CloudUpload,
  FolderOpen,
  OpenInNew,
  Pause,
  Refresh,
  WarningAmber,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
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
import { generateUploadFrames, type GenerationProgress } from "./asset-generator";
import { scanBrowserUploadFiles } from "./source-scanner";
import { WebUploadRunner } from "./upload-runner";
import type {
  BrowserUploadFile,
  GeneratedUploadFrame,
  UploadRunnerSnapshot,
  WebUploadPlan,
} from "./web-upload-types";

const DEFAULT_NEW_CASE_SLUG = "new-case";
const DEFAULT_NEW_CASE_TITLE = "New Case";
const INPUT_HASH_STORAGE_PREFIX = "magic_compare_web_upload:";

interface WebUploadWorkbenchProps {
  cases: CaseCatalogItem[];
  initialCaseSlug: string | null;
}

interface FramePreviewRow {
  order: number;
  title: string;
  beforePath: string;
  afterPath: string;
  heatmapPath: string | null;
  miscCount: number;
}

interface PlanView {
  sourceRootName: string;
  suggestedGroupSlug: string;
  suggestedGroupTitle: string;
  frames: FramePreviewRow[];
  ignoredCount: number;
  warningCount: number;
  errorCount: number;
  issues: Array<{ severity: "warning" | "error"; message: string; path: string }>;
}

interface PreviewPair {
  title: string;
  beforeUrl: string;
  afterUrl: string;
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

function buildPlanView(plan: WebUploadPlan): PlanView {
  return {
    sourceRootName: plan.sourceRootName,
    suggestedGroupSlug: plan.suggestedGroupSlug,
    suggestedGroupTitle: plan.suggestedGroupTitle,
    frames: plan.frames.map((frame) => ({
      order: frame.order,
      title: frame.title,
      beforePath: frame.before.source.relativePath,
      afterPath: frame.after.source.relativePath,
      heatmapPath: frame.heatmap?.source.relativePath ?? null,
      miscCount: frame.misc.length,
    })),
    ignoredCount: plan.ignoredFiles.length,
    warningCount: plan.issues.filter((issue) => issue.severity === "warning").length,
    errorCount: plan.issues.filter((issue) => issue.severity === "error").length,
    issues: plan.issues.map((issue) => ({
      severity: issue.severity,
      message: issue.message,
      path: issue.path,
    })),
  };
}

function guessCaseTitle(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCaseInput(cases: CaseCatalogItem[], selectedCaseSlug: string, newCase: {
  slug: string;
  title: string;
  summary: string;
}) {
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

function createPreviewPairs(plan: WebUploadPlan) {
  return plan.frames.slice(0, 5).map((frame) => ({
    title: frame.title,
    beforeUrl: URL.createObjectURL(frame.before.source.file),
    afterUrl: URL.createObjectURL(frame.after.source.file),
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
      sx={{ height: 34, "& .MuiChip-label": { px: 1.35 } }}
    />
  );
}

function PreviewStrip({ pairs }: { pairs: PreviewPair[] }) {
  if (pairs.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        gap: 1.1,
      }}
    >
      {pairs.map((pair) => (
        <Box
          key={pair.title}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.035)",
          }}
        >
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <Box
              component="img"
              src={pair.beforeUrl}
              alt={`${pair.title} before preview`}
              sx={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }}
            />
            <Box
              component="img"
              src={pair.afterUrl}
              alt={`${pair.title} after preview`}
              sx={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }}
            />
          </Box>
          <Typography
            variant="caption"
            sx={{ display: "block", px: 1, py: 0.75, color: "text.secondary" }}
          >
            {pair.title}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function PairingTable({ rows }: { rows: FramePreviewRow[] }) {
  if (rows.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 3 }}>
        选择文件夹后会显示 before / after 配对结果。
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        maxHeight: 430,
        overflow: "auto",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "74px minmax(0, 1fr) minmax(0, 1fr) minmax(116px, 0.45fr)",
          gap: 1,
          px: 1.35,
          py: 1,
          position: "sticky",
          top: 0,
          zIndex: 1,
          color: "text.secondary",
          backgroundColor: "rgba(10, 24, 51, 0.96)",
          borderBottom: "1px solid",
          borderColor: "divider",
          fontSize: 13,
        }}
      >
        <span>索引</span>
        <span>before</span>
        <span>after</span>
        <span>heatmap</span>
      </Box>
      {rows.map((row) => (
        <Box
          key={row.order}
          sx={{
            display: "grid",
            gridTemplateColumns: "74px minmax(0, 1fr) minmax(0, 1fr) minmax(116px, 0.45fr)",
            gap: 1,
            px: 1.35,
            py: 1.1,
            borderBottom: "1px solid",
            borderColor: "rgba(255,255,255,0.075)",
            contentVisibility: "auto",
            containIntrinsicSize: "56px",
            alignItems: "center",
            "&:last-of-type": { borderBottom: 0 },
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {String(row.order + 1).padStart(3, "0")}
          </Typography>
          <Typography variant="body2" noWrap title={row.beforePath}>
            {row.beforePath}
          </Typography>
          <Typography variant="body2" noWrap title={row.afterPath}>
            {row.afterPath}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {row.heatmapPath ? "显式文件" : "浏览器生成"}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function UploadQueue({ snapshot }: { snapshot: UploadRunnerSnapshot }) {
  if (snapshot.frames.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        上传开始后会显示每个 frame 的进度。
      </Typography>
    );
  }

  return (
    <Stack spacing={0.75}>
      {snapshot.frames.slice(0, 12).map((frame) => {
        const progress =
          frame.totalFiles > 0 ? (frame.completedFiles / frame.totalFiles) * 100 : 0;
        return (
          <Box
            key={frame.frameOrder}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "minmax(0, 1fr) 88px minmax(120px, 0.55fr)",
              },
              gap: 1,
              alignItems: "center",
              px: 1.2,
              py: 0.9,
              borderRadius: 1.5,
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
      {snapshot.frames.length > 12 ? (
        <Typography variant="caption" color="text.secondary">
          仅显示前 12 项；其余 frame 会继续上传。
        </Typography>
      ) : null}
    </Stack>
  );
}

/**
 * Presents upload as a focused workbench: files and metadata on the left, pairing and queue state
 * on the right. Heavy File/Blob data stays in refs and the upload runner.
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
  const [previewPairs, setPreviewPairs] = useState<PreviewPair[]>([]);
  const [generationProgress, setGenerationProgress] =
    useState<GenerationProgress | null>(null);
  const [snapshot, setSnapshot] = useState<UploadRunnerSnapshot>(() =>
    buildInitialSnapshot(),
  );
  const [message, setMessage] = useState("推荐使用 Chrome / Edge 选择整个目录上传。");

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
    return () => {
      for (const pair of previewPairs) {
        URL.revokeObjectURL(pair.beforeUrl);
        URL.revokeObjectURL(pair.afterUrl);
      }
    };
  }, [previewPairs]);

  useEffect(() => {
    return () => {
      unsubscribeRunnerRef.current?.();
      runnerRef.current?.dispose();
    };
  }, []);

  /**
   * Runs the scanner and stores the heavy plan outside React state; the component receives only a
   * compact render model and short-lived object URLs for the first few previews.
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
    setGroupMeta((current) => ({
      ...current,
      slug: current.slug === "uploaded-group" ? plan.suggestedGroupSlug : current.slug,
      title:
        current.title === "Uploaded Group" ? plan.suggestedGroupTitle : current.title,
    }));
    setPlanView(buildPlanView(plan));
    setPreviewPairs((current) => {
      for (const pair of current) {
        URL.revokeObjectURL(pair.beforeUrl);
        URL.revokeObjectURL(pair.afterUrl);
      }
      return createPreviewPairs(plan);
    });
    setMessage(
      plan.issues.some((issue) => issue.severity === "error")
        ? "预演发现阻塞问题，请先修正文件夹。"
        : "预演完成，可以开始上传。",
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
      setMessage(error instanceof Error ? error.message : "读取目录失败。");
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
    const frames = await generateUploadFrames(plan.frames, (progress) => {
      setGenerationProgress(progress);
    });
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

  return (
    <Stack spacing={{ xs: 2.4, md: 3 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", md: "flex-start" }}
        spacing={1.5}
      >
        <Stack spacing={0.8}>
          <Typography variant="h2" component="h1" sx={{ lineHeight: 1.02 }}>
            上传 Group
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 720 }}>
            从本地 before / after 图片目录创建 internal Group。不会自动发布公开站点。
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button component={Link} href="/" variant="text" startIcon={<ArrowBack />}>
            Back to catalog
          </Button>
          {snapshot.stage === "uploading" ? (
            <Button variant="outlined" startIcon={<Pause />} onClick={pauseUpload}>
              暂停
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={snapshot.stage === "failed" ? <Refresh /> : <CloudUpload />}
              disabled={!canStart || snapshot.stage === "generating" || snapshot.stage === "completed"}
              onClick={startOrResumeUpload}
            >
              {snapshot.stage === "paused" || snapshot.stage === "failed" ? "继续上传" : "开始上传"}
            </Button>
          )}
          {snapshot.stage === "completed" ? (
            <Button variant="outlined" endIcon={<OpenInNew />} onClick={openCompletedGroup}>
              打开 Group
            </Button>
          ) : null}
        </Stack>
      </Stack>

      <Alert
        severity={hasBlockingIssues || snapshot.stage === "failed" ? "warning" : "info"}
        icon={hasBlockingIssues ? <WarningAmber /> : undefined}
        sx={{ borderRadius: 2 }}
      >
        {snapshot.stage === "idle" || snapshot.stage === "scanned" ? message : snapshot.message}
      </Alert>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(310px, 0.82fr) minmax(0, 1.58fr)" },
          gap: { xs: 1.6, md: 2 },
          alignItems: "start",
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 2.45 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.025) 100%)",
          }}
        >
          <Stack spacing={2.1}>
            <Stack spacing={0.7}>
              <Typography variant="h6">目标与元数据</Typography>
              <Typography variant="body2" color="text.secondary">
                上传期间会锁定 Case 和源目录，防止任务输入变化。
              </Typography>
            </Stack>

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
              <Stack spacing={1.15}>
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

            <Stack spacing={1.15}>
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

            <Stack spacing={1.15}>
              <Button
                variant="outlined"
                startIcon={<FolderOpen />}
                disabled={isLocked}
                onClick={chooseDirectory}
              >
                选择文件夹
              </Button>
              <Typography variant="caption" color="text.secondary">
                优先使用 Chromium 的目录选择；不支持时退回 webkitdirectory。
              </Typography>
              <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                onChange={handleFallbackInput}
                {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              />
            </Stack>

            <FormControlLabel
              control={
                <Checkbox
                  checked
                  disabled
                />
              }
              label="缺少显式 heatmap 时由浏览器生成"
            />

            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
              <StatChip label="Frames" value={planView?.frames.length ?? 0} />
              <StatChip label="忽略" value={planView?.ignoredCount ?? 0} />
              <StatChip label="问题" value={planView?.errorCount ?? 0} />
            </Stack>
          </Stack>
        </Paper>

        <Stack spacing={1.6}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 2.35 },
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)",
            }}
          >
            <Stack spacing={1.7}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                spacing={1}
              >
                <Stack spacing={0.35}>
                  <Typography variant="h6">配对预演</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {planView
                      ? `${planView.sourceRootName} · ${planView.frames.length} 对图片`
                      : "支持 flat 目录或 before / after / heatmap / misc 分层目录。"}
                  </Typography>
                </Stack>
                {planView ? (
                  <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                    <Chip
                      icon={hasBlockingIssues ? <WarningAmber /> : <CheckCircle />}
                      label={hasBlockingIssues ? "需要修正" : "可上传"}
                      color={hasBlockingIssues ? "warning" : "primary"}
                      sx={{ height: 34 }}
                    />
                  </Stack>
                ) : null}
              </Stack>

              <PairingTable rows={planView?.frames ?? []} />
              {planView?.issues.length ? (
                <Stack spacing={0.7}>
                  {planView.issues.slice(0, 5).map((issue, index) => (
                    <Alert key={`${issue.path}-${index}`} severity={issue.severity} sx={{ py: 0.6 }}>
                      {issue.message}
                      <Typography variant="caption" sx={{ display: "block", opacity: 0.75 }}>
                        {issue.path}
                      </Typography>
                    </Alert>
                  ))}
                  {planView.issues.length > 5 ? (
                    <Typography variant="caption" color="text.secondary">
                      还有 {planView.issues.length - 5} 个问题未显示。
                    </Typography>
                  ) : null}
                </Stack>
              ) : null}
            </Stack>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 2.35 },
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
            }}
          >
            <Stack spacing={1.6}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                spacing={1}
              >
                <Stack spacing={0.35}>
                  <Typography variant="h6">生成与上传队列</Typography>
                  <Typography variant="body2" color="text.secondary">
                    缩略图、heatmap 和 SHA-256 在 Worker 中生成；commit 保持串行。
                  </Typography>
                </Stack>
                <Chip
                  label={
                    snapshot.stage === "generating"
                      ? "生成中"
                      : snapshot.stage === "uploading"
                        ? "上传中"
                        : snapshot.stage === "completed"
                          ? "完成"
                          : snapshot.stage === "failed"
                            ? "失败"
                            : "待上传"
                  }
                  color={
                    snapshot.stage === "completed"
                      ? "primary"
                      : snapshot.stage === "failed"
                        ? "warning"
                        : "default"
                  }
                  sx={{ height: 34 }}
                />
              </Stack>

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
          </Paper>

          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 2.35 },
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
              background: "rgba(255,255,255,0.025)",
            }}
          >
            <Stack spacing={1.5}>
              <Typography variant="h6">前几组预览</Typography>
              <PreviewStrip pairs={previewPairs} />
              {previewPairs.length === 0 ? (
                <Typography color="text.secondary">
                  扫描后会显示最多 5 组 before / after 预览。
                </Typography>
              ) : null}
            </Stack>
          </Paper>
        </Stack>
      </Box>
    </Stack>
  );
}
