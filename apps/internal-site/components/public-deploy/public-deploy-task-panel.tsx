"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  Close,
  CloudSyncOutlined,
  ErrorOutlined,
  OpenInNew,
  Replay,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Collapse,
  IconButton,
  LinearProgress,
  Paper,
  Portal,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { usePathname } from "next/navigation";
import {
  PUBLIC_DEPLOY_STAGE_LABELS,
  summarizePublicDeployError,
  type PublicDeployJob,
  type PublicDeployStage,
} from "@/lib/public-deploy-job";
import { resolvePublicDeployMonitorUrl } from "./public-deploy-links";

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} 秒`;
}

function formatStageDurations(
  durations: Partial<Record<PublicDeployStage, number>>,
): string | null {
  // Content writes already refresh manifests, so deployment timing only covers full-site work.
  const visibleStages: PublicDeployStage[] = ["building", "uploading"];
  const shortLabels: Partial<Record<PublicDeployStage, string>> = {
    building: "构建",
    uploading: "上传",
  };
  const parts = visibleStages.flatMap((stage) =>
    durations[stage] === undefined
      ? []
      : [`${shortLabels[stage]} ${formatDuration(durations[stage])}`],
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Advances elapsed time locally while backend polling remains focused on meaningful state changes. */
function useElapsedMs(job: PublicDeployJob): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (job.status !== "running") return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [job.status]);
  return job.elapsedMs ?? Math.max(0, now - new Date(job.startedAt).getTime());
}

/** Renders truthful phase progress without inserting content into the route layout. */
export function PublicDeployTaskPanel({
  job,
  open,
  onClose,
  onRetry,
}: {
  job: PublicDeployJob | null;
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  if (!job) return null;
  return <PublicDeployTaskPanelContent job={job} open={open} onClose={onClose} onRetry={onRetry} />;
}

function PublicDeployTaskPanelContent({
  job,
  open,
  onClose,
  onRetry,
}: {
  job: PublicDeployJob;
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const pathname = usePathname();
  const elapsedMs = useElapsedMs(job);
  const stageDurationSummary = useMemo(
    () => formatStageDurations(job.stageDurationsMs),
    [job.stageDurationsMs],
  );
  const uploadPercent = job.uploadProgress
    ? Math.min(100, (job.uploadProgress.completed / job.uploadProgress.total) * 100)
    : null;
  const isRunning = job.status === "running";
  // dev:all points the job base URL at port 3001; preserving the current Group alias here makes
  // the completion action open the exact static deployment that the operator was reviewing.
  const monitorUrl = resolvePublicDeployMonitorUrl(job.publicSiteUrl, pathname);
  const title =
    job.status === "failed"
      ? "部署失败"
      : job.status === "succeeded"
        ? job.skipped
          ? "公开站点无需更新"
          : "部署完成"
        : "部署公开站点";
  const statusText = isRunning
    ? PUBLIC_DEPLOY_STAGE_LABELS[job.stage]
    : job.status === "failed"
      ? summarizePublicDeployError(job.error || "部署公开站点失败。")
      : job.skipped
        ? "发布内容和站点代码均未变化"
        : `已更新 ${job.projectName || "Cloudflare Pages"}`;
  const StatusIcon =
    job.status === "failed"
      ? ErrorOutlined
      : job.status === "succeeded"
        ? CheckCircleOutlined
        : CloudSyncOutlined;

  return (
    <Portal>
      <Collapse in={open} timeout={180} unmountOnExit>
        <Paper
          role="status"
          aria-live="polite"
          sx={{
            // A viewport-level task surface avoids the route transform and prevents progress from
            // pushing Group lists or workspace content while its labels change.
            position: "fixed",
            zIndex: "snackbar",
            right: { xs: 16, sm: 24 },
            bottom: {
              xs: "max(16px, env(safe-area-inset-bottom))",
              sm: "max(24px, env(safe-area-inset-bottom))",
            },
            width: "min(calc(100vw - 32px), 420px)",
            minHeight: 150,
            p: 2,
            borderRadius: "16px",
            backgroundColor: "var(--mui-palette-surface-containerHigh)",
            boxShadow: 6,
          }}
        >
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
              <Box
                sx={{
                  display: "grid",
                  placeItems: "center",
                  width: 32,
                  height: 32,
                  flex: "0 0 auto",
                  borderRadius: "50%",
                  color:
                    job.status === "failed"
                      ? "error.main"
                      : job.status === "succeeded"
                        ? "success.main"
                        : "primary.main",
                  backgroundColor:
                    job.status === "failed"
                      ? "error.light"
                      : job.status === "succeeded"
                        ? "success.light"
                        : "primary.light",
                }}
              >
                <StatusIcon fontSize="small" />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1">{title}</Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 0.25,
                    display: "-webkit-box",
                    overflow: "hidden",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {statusText}
                </Typography>
              </Box>
              {job.status === "succeeded" && monitorUrl ? (
                <Tooltip title="打开部署结果">
                  <IconButton
                    component="a"
                    href={monitorUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="打开部署结果"
                    size="small"
                    sx={{ width: 32, height: 32 }}
                  >
                    <OpenInNew fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
              <Tooltip title="收起">
                <IconButton
                  aria-label="收起部署进度"
                  size="small"
                  onClick={onClose}
                  sx={{ width: 32, height: 32 }}
                >
                  <Close fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>

            <Box>
              <LinearProgress
                variant={
                  job.status === "succeeded" || job.status === "failed" || uploadPercent !== null
                    ? "determinate"
                    : "indeterminate"
                }
                value={
                  job.status === "succeeded"
                    ? 100
                    : (uploadPercent ?? (job.completedStageCount / job.stageSequence.length) * 100)
                }
                color={job.status === "failed" ? "error" : "primary"}
                sx={{ height: 4, borderRadius: 2 }}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 0.75, justifyContent: "space-between" }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    // Compact phones keep total time visible; optional phase timings truncate
                    // instead of wrapping underneath and increasing the task surface height.
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isRunning
                    ? `${Math.min(job.completedStageCount + 1, job.stageSequence.length)} / ${job.stageSequence.length}`
                    : stageDurationSummary || "任务已结束"}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ flex: "0 0 auto", fontVariantNumeric: "tabular-nums" }}
                >
                  {job.uploadProgress && isRunning
                    ? `${job.uploadProgress.completed} / ${job.uploadProgress.total} 文件`
                    : formatDuration(elapsedMs)}
                </Typography>
              </Stack>
            </Box>

            {job.status === "failed" ? (
              <Button
                size="small"
                startIcon={<Replay />}
                onClick={onRetry}
                sx={{ alignSelf: "flex-start" }}
              >
                重新部署
              </Button>
            ) : null}
          </Stack>
        </Paper>
      </Collapse>
    </Portal>
  );
}
