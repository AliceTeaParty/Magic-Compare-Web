"use client";

import { useState } from "react";
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
  Divider,
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
import type { GenerationProgress } from "./asset-generator";
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
import type { UploadRunnerSnapshot, WebUploadPlan } from "./web-upload-types";
import type { PlanView } from "./web-upload-view-model";
import { useWebUploadPlan } from "./use-web-upload-plan";
import { useWebUploadSession } from "./use-web-upload-session";

const UPLOAD_QUEUE_VISIBLE_LIMIT = 12;

interface WebUploadWorkbenchProps {
  cases: CaseCatalogItem[];
  initialCaseSlug: string | null;
}

function normalizeSlug(value: string, fallback = "uploaded-group") {
  return cjkKebabCase(value, fallback);
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
      title: "正在完整预检",
      detail: generationProgress
        ? `${generationProgress.completed}/${generationProgress.total} · ${generationProgress.label}`
        : "解码图片、检查尺寸并计算摘要",
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
  const {
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
    pairingSuffixPreferences,
    renamePairingColumn,
    reorderPairingRows,
    reportGenerationProgress,
    resetPlan,
    setExpandedFrameId,
    setPairingSuffixPreferences,
    sourceRootName,
  } = useWebUploadPlan();
  const { abandonUpload, pauseUpload, resetSession, snapshot, startOrResumeUpload } =
    useWebUploadSession();
  const [selectedCaseSlug, setSelectedCaseSlug] = useState(() => {
    if (initialCaseSlug && cases.some((item) => item.slug === initialCaseSlug)) {
      return initialCaseSlug;
    }
    return cases[0]?.slug ?? "";
  });
  const [actionMenuAnchor, setActionMenuAnchor] = useState<HTMLElement | null>(null);
  const [groupMeta, setGroupMeta] = useState<UploadGroupMeta>({
    slug: "uploaded-group",
    title: "上传图组",
    description: "",
  });

  // Failed uploads can be resumed against the existing server job. Keep metadata locked there too
  // so visible inputs cannot drift away from the payload already owned by the runner.
  const isLocked =
    isScanning ||
    snapshot.stage === "generating" ||
    snapshot.stage === "uploading" ||
    snapshot.stage === "paused" ||
    snapshot.stage === "failed";
  const selectedCaseExists = cases.some((item) => item.slug === selectedCaseSlug);
  const hasBlockingIssues = Boolean(planView && planView.errorCount > 0);
  const canStart = Boolean(
    selectedCaseExists &&
    planView &&
    planView.frames.length > 0 &&
    planRef.current &&
    !hasBlockingIssues,
  );
  const canAbandon =
    Boolean(planRef.current) && snapshot.stage !== "idle" && snapshot.stage !== "completed";
  const showProgressPanel = snapshot.stage !== "idle" && snapshot.stage !== "scanned";
  const overallProgress =
    snapshot.totalFiles > 0 ? (snapshot.completedFiles / snapshot.totalFiles) * 100 : 0;

  /** A fresh source plan starts a distinct runner session and refreshes inferred group identity. */
  function acceptPlan(plan: WebUploadPlan) {
    resetSession("scanned");
    setGroupMeta((current) => ({
      ...current,
      slug: plan.suggestedGroupSlug,
      title: plan.suggestedGroupTitle,
    }));
  }

  function beginUpload() {
    void startOrResumeUpload({
      canStart,
      cases,
      ensurePreflightedFrames,
      groupInput: { ...groupMeta, slug: normalizeSlug(groupMeta.slug) },
      onGenerationProgress: reportGenerationProgress,
      selectedCaseSlug,
    });
  }

  async function abandonCurrentUpload() {
    if (canAbandon && (await abandonUpload(groupMeta.slug))) {
      resetPlan();
    }
  }

  function openCompletedGroup() {
    const result = snapshot.result;
    if (!result) {
      return;
    }

    router.push(`/cases/${result.caseSlug}/groups/${result.groupSlug}`);
  }

  return (
    <>
      <Box sx={{ display: { xs: "block", md: "none" }, py: 5 }}>
        <Paper elevation={0} sx={{ ...webUploadPanelSx, maxWidth: 480, mx: "auto" }}>
          <Stack spacing={0.75}>
            <Typography component="h1" variant="h3">
              上传工作台仅支持桌面浏览器
            </Typography>
            <Typography color="text.secondary">
              请在电脑上选择文件夹、检查配对并开始上传。
            </Typography>
          </Stack>
        </Paper>
      </Box>

      <Stack spacing={2} sx={{ display: { xs: "none", md: "flex" } }}>
        <InternalPageHeader
          title="上传对比"
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
                  打开图组
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
                  onClick={beginUpload}
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
                    void abandonCurrentUpload();
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
          onChange={(event) => handleFallbackInput(event, acceptPlan)}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />

        {!planView ? (
          <UploadIntakePanel
            isScanning={isScanning}
            onChooseDirectory={() => void chooseDirectory(isLocked, acceptPlan)}
          />
        ) : (
          <Box
            sx={{
              display: "grid",
              // Match the Case workspace: inspection stays wide, supporting controls sit at right.
              gridTemplateColumns: "minmax(0, 1fr) 336px",
              gap: 2.5,
              alignItems: "start",
              minWidth: 0,
            }}
          >
            <PairingPreviewPanel
              plan={planRef.current}
              planView={planView}
              canReorder={snapshot.stage === "scanned"}
              expandedFrameId={expandedFrameId}
              frameTitleMode={frameTitleMode}
              hasBlockingIssues={hasBlockingIssues}
              onExpandedFrameChange={setExpandedFrameId}
              onFrameTitleModeChange={(mode) =>
                changeFrameTitleMode(mode, snapshot.stage === "scanned")
              }
              onHeatmapReferenceChange={(label) =>
                changeHeatmapReference(label, snapshot.stage === "scanned")
              }
              onRenameColumn={(column, label) =>
                renamePairingColumn(column, label, snapshot.stage === "scanned")
              }
              onReorder={(activeFrameId, overFrameId) =>
                reorderPairingRows(activeFrameId, overFrameId, snapshot.stage === "scanned")
              }
            />
            <Stack
              spacing={1.5}
              sx={{
                minWidth: 0,
                position: "sticky",
                top: 16,
              }}
            >
              {showProgressPanel ? (
                <Paper elevation={0} sx={{ ...webUploadPanelSx, p: 0, overflow: "hidden" }}>
                  {/* Progress uses the same header/body division as the source and pairing cards. */}
                  <Typography component="h2" variant="h4" sx={{ px: 2.25, py: 1.75 }}>
                    进度
                  </Typography>
                  <Divider />
                  <Box sx={{ p: 2.25 }}>
                    <UploadDetails
                      generationProgress={generationProgress}
                      overallProgress={overallProgress}
                      planView={planView}
                      snapshot={snapshot}
                    />
                  </Box>
                </Paper>
              ) : null}

              <UploadConfigurationPanel
                cases={cases}
                groupMeta={groupMeta}
                isLocked={isLocked}
                selectedCaseSlug={selectedCaseSlug}
                sourceRootName={sourceRootName ?? groupMeta.title}
                onCaseChange={setSelectedCaseSlug}
                onChooseDirectory={() => void chooseDirectory(isLocked, acceptPlan)}
                onGroupMetaChange={(nextMeta) =>
                  setGroupMeta({ ...nextMeta, slug: normalizeSlug(nextMeta.slug) })
                }
                onPairingSuffixPreferencesChange={setPairingSuffixPreferences}
                pairingSuffixPreferences={pairingSuffixPreferences}
              />
              <UploadFlowStrip
                generationProgress={generationProgress}
                overallProgress={overallProgress}
                planView={planView}
                snapshot={snapshot}
                sourceRootName={sourceRootName}
              />
            </Stack>
          </Box>
        )}
      </Stack>
    </>
  );
}
