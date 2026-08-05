"use client";

import type { ElementType } from "react";
import {
  AutoFixHighRounded,
  CheckRounded,
  CloudUploadOutlined,
  ErrorOutlineRounded,
  FactCheckOutlined,
  FolderOpenRounded,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ViewerMode } from "@magic-compare/content-schema";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";
import { CaseCreateButton } from "../case-create-button";
import { FluentFolderEmoji } from "../fluent-emoji";
import type { GenerationProgress } from "./asset-generator";
import {
  webUploadFieldSx,
  webUploadPanelSx,
  webUploadRadii,
  webUploadSizes,
  webUploadSurfaces,
} from "./web-upload-design";
import type { UploadRunnerSnapshot } from "./web-upload-types";
import type { PlanView } from "./web-upload-view-model";

export interface UploadGroupMeta {
  slug: string;
  title: string;
  description: string;
  defaultMode: ViewerMode;
}

const FLOW_STEPS: Array<{ icon: ElementType; label: string }> = [
  { icon: FolderOpenRounded, label: "素材" },
  { icon: FactCheckOutlined, label: "配对" },
  { icon: AutoFixHighRounded, label: "生成" },
  { icon: CloudUploadOutlined, label: "上传" },
];

/** Maps runner detail onto the four operator decisions without changing the upload state machine. */
function getFlowState({
  generationProgress,
  overallProgress,
  planView,
  snapshot,
  sourceRootName,
}: {
  generationProgress: GenerationProgress | null;
  overallProgress: number;
  planView: PlanView | null;
  snapshot: UploadRunnerSnapshot;
  sourceRootName: string | null;
}) {
  const hasPlan = Boolean(planView);
  const hasUploadJob = Boolean(snapshot.jobId || snapshot.totalFiles > 0);
  const generationComplete =
    snapshot.stage === "ready" ||
    snapshot.stage === "uploading" ||
    snapshot.stage === "paused" ||
    snapshot.stage === "completed" ||
    (snapshot.stage === "failed" && hasUploadJob);
  const uploadStarted =
    snapshot.stage === "uploading" ||
    snapshot.stage === "paused" ||
    snapshot.stage === "completed" ||
    (snapshot.stage === "failed" && hasUploadJob);

  let activeIndex = 0;
  if (hasPlan) activeIndex = 1;
  if (snapshot.stage === "generating" || generationComplete) activeIndex = 2;
  if (uploadStarted) activeIndex = 3;

  const details = [
    sourceRootName ?? "未选择",
    planView
      ? planView.errorCount > 0
        ? `${planView.errorCount} 项问题`
        : `${planView.healthyPairCount} Frame`
      : "等待",
    snapshot.stage === "generating" && generationProgress
      ? `${generationProgress.completed}/${generationProgress.total}`
      : snapshot.stage === "failed" && !hasUploadJob
        ? "失败"
        : generationComplete
          ? "已完成"
          : "等待",
    snapshot.stage === "completed"
      ? "已完成"
      : snapshot.stage === "failed" && hasUploadJob
        ? "失败"
        : uploadStarted
          ? `${Math.round(overallProgress)}%`
          : "等待",
  ];

  return {
    activeIndex,
    details,
    failedIndex:
      snapshot.stage === "failed" ? (hasUploadJob ? 3 : 2) : planView?.errorCount ? 1 : -1,
    progress: snapshot.stage === "completed" ? 100 : (activeIndex / (FLOW_STEPS.length - 1)) * 100,
  };
}

/** Keeps the workflow visible as one continuous task band instead of four disconnected cards. */
export function UploadFlowStrip({
  generationProgress,
  overallProgress,
  planView,
  snapshot,
  sourceRootName,
}: {
  generationProgress: GenerationProgress | null;
  overallProgress: number;
  planView: PlanView | null;
  snapshot: UploadRunnerSnapshot;
  sourceRootName: string | null;
}) {
  const flow = getFlowState({
    generationProgress,
    overallProgress,
    planView,
    snapshot,
    sourceRootName,
  });

  return (
    <Paper
      component="section"
      elevation={0}
      aria-label="上传进度"
      sx={{
        position: "relative",
        overflow: "hidden",
        px: { xs: 1.25, sm: 2.25 },
        py: { xs: 1.35, sm: 1.6 },
        borderRadius: webUploadRadii.panel,
        backgroundColor: webUploadSurfaces.flow,
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          position: "absolute",
          top: { xs: 30, sm: 32 },
          left: { xs: "13%", sm: "12.5%" },
          right: { xs: "13%", sm: "12.5%" },
          height: 2,
          overflow: "hidden",
          backgroundColor: webUploadSurfaces.progressTrack,
        }}
      >
        {/* Progress updates stay on the compositor so frequent upload ticks do not relayout the flow. */}
        <Box
          sx={{
            width: "100%",
            height: "100%",
            backgroundColor: "primary.main",
            transform: `scaleX(${flow.progress / 100})`,
            transformOrigin: "left center",
            transition: "transform 300ms cubic-bezier(0.2, 0, 0, 1)",
            "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          }}
        />
      </Box>

      <Box
        role="list"
        sx={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: { xs: 0.5, sm: 1 },
        }}
      >
        {FLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          const completed = index < flow.activeIndex || snapshot.stage === "completed";
          const active = index === flow.activeIndex && snapshot.stage !== "completed";
          const failed = index === flow.failedIndex;

          return (
            <Stack
              key={step.label}
              role="listitem"
              spacing={0.45}
              sx={{ alignItems: "center", minWidth: 0, textAlign: "center" }}
            >
              <Box
                sx={{
                  position: "relative",
                  zIndex: 1,
                  width: webUploadSizes.flowMarker,
                  height: webUploadSizes.flowMarker,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 999,
                  color: completed
                    ? "success.contrastText"
                    : failed
                      ? index === 1
                        ? "warning.contrastText"
                        : "error.contrastText"
                      : active
                        ? "primary.contrastText"
                        : "text.secondary",
                  backgroundColor: completed
                    ? "success.main"
                    : failed
                      ? index === 1
                        ? "warning.main"
                        : "error.main"
                      : active
                        ? "primary.main"
                        : webUploadSurfaces.controlBackground,
                }}
              >
                {completed ? (
                  <CheckRounded sx={{ fontSize: 19 }} />
                ) : failed ? (
                  <ErrorOutlineRounded sx={{ fontSize: 19 }} />
                ) : (
                  <Icon sx={{ fontSize: 18 }} />
                )}
              </Box>
              <Typography
                variant="body2"
                noWrap
                sx={{ width: "100%", fontWeight: active ? 700 : 550 }}
              >
                {step.label}
              </Typography>
              <Typography
                variant="caption"
                noWrap
                title={flow.details[index]}
                sx={{
                  display: { xs: "none", sm: "block" },
                  width: "100%",
                  color: "text.secondary",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {flow.details[index]}
              </Typography>
            </Stack>
          );
        })}
      </Box>
    </Paper>
  );
}

/** Shows only the two decisions required before a directory exists: destination and source. */
export function UploadIntakePanel({
  cases,
  isScanning,
  onCaseChange,
  onChooseDirectory,
  selectedCaseSlug,
}: {
  cases: CaseCatalogItem[];
  isScanning: boolean;
  onCaseChange: (caseSlug: string) => void;
  onChooseDirectory: () => void;
  selectedCaseSlug: string;
}) {
  return (
    <Paper
      component="section"
      elevation={0}
      sx={{
        minHeight: { xs: 360, md: 420 },
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(280px, 0.85fr) minmax(0, 1.15fr)" },
        overflow: "hidden",
        borderRadius: webUploadRadii.panel,
        backgroundColor: webUploadSurfaces.panel,
      }}
    >
      <Stack
        spacing={2}
        sx={{
          justifyContent: "center",
          p: { xs: 2, sm: 3, lg: 4 },
          borderBottom: { xs: "1px solid", md: 0 },
          borderRight: { xs: 0, md: "1px solid" },
          borderColor: "divider",
        }}
      >
        <Stack spacing={0.5}>
          <Typography component="h2" variant="h3">
            上传到
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {cases.find((item) => item.slug === selectedCaseSlug)?.title ?? "尚无 Case"}
          </Typography>
        </Stack>

        {cases.length === 0 ? (
          <Stack spacing={1.25}>
            <Alert severity="warning">上传前需要创建 Case。</Alert>
            <CaseCreateButton />
          </Stack>
        ) : (
          <FormControl fullWidth size="small">
            <InputLabel id="web-upload-intake-case-label">目标 Case</InputLabel>
            <Select
              labelId="web-upload-intake-case-label"
              label="目标 Case"
              value={selectedCaseSlug}
              onChange={(event) => onCaseChange(event.target.value)}
            >
              {cases.map((item) => (
                <MenuItem key={item.slug} value={item.slug}>
                  {item.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Stack>

      <Stack
        spacing={1.5}
        sx={{
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 3, sm: 4 },
          textAlign: "center",
          backgroundColor: webUploadSurfaces.intake,
        }}
      >
        <FluentFolderEmoji size={88} />
        <Stack spacing={0.35}>
          <Typography component="h2" variant="h3">
            素材目录
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isScanning ? "正在读取" : "未选择"}
          </Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<FolderOpenRounded />}
          loading={isScanning}
          disabled={cases.length === 0}
          onClick={onChooseDirectory}
          sx={{ minWidth: 152 }}
        >
          选择文件夹
        </Button>
      </Stack>
    </Paper>
  );
}

/** Keeps source identity, destination, and Group metadata in one stable supporting pane. */
export function UploadConfigurationPanel({
  cases,
  groupMeta,
  isLocked,
  onCaseChange,
  onChooseDirectory,
  onGroupMetaChange,
  selectedCaseSlug,
  sourceRootName,
}: {
  cases: CaseCatalogItem[];
  groupMeta: UploadGroupMeta;
  isLocked: boolean;
  onCaseChange: (caseSlug: string) => void;
  onChooseDirectory: () => void;
  onGroupMetaChange: (nextMeta: UploadGroupMeta) => void;
  selectedCaseSlug: string;
  sourceRootName: string;
}) {
  return (
    <Paper elevation={0} sx={{ ...webUploadPanelSx, ...webUploadFieldSx }}>
      <Stack spacing={2}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.1, minWidth: 0 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              flex: "0 0 auto",
              display: "grid",
              placeItems: "center",
              borderRadius: 999,
              color: "secondary.contrastText",
              backgroundColor: "secondary.main",
            }}
          >
            <FolderOpenRounded sx={{ fontSize: 20 }} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              素材目录
            </Typography>
            <Typography variant="subtitle1" noWrap title={sourceRootName} sx={{ fontWeight: 700 }}>
              {sourceRootName}
            </Typography>
          </Box>
          <Tooltip title="重新选择文件夹">
            <span>
              <IconButton
                aria-label="重新选择文件夹"
                disabled={isLocked}
                onClick={onChooseDirectory}
              >
                <FolderOpenRounded />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        <Divider />

        <Stack spacing={1.5}>
          <Typography component="h2" variant="h4">
            Group 信息
          </Typography>
          <FormControl fullWidth size="small" disabled={isLocked}>
            <InputLabel id="web-upload-config-case-label">目标 Case</InputLabel>
            <Select
              labelId="web-upload-config-case-label"
              label="目标 Case"
              value={selectedCaseSlug}
              onChange={(event) => onCaseChange(event.target.value)}
            >
              {cases.map((item) => (
                <MenuItem key={item.slug} value={item.slug}>
                  {item.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Slug"
            size="small"
            value={groupMeta.slug}
            disabled={isLocked}
            onChange={(event) => onGroupMetaChange({ ...groupMeta, slug: event.target.value })}
          />
          <TextField
            label="标题"
            size="small"
            value={groupMeta.title}
            disabled={isLocked}
            onChange={(event) => onGroupMetaChange({ ...groupMeta, title: event.target.value })}
          />
          <TextField
            label="描述"
            size="small"
            multiline
            minRows={2}
            value={groupMeta.description}
            disabled={isLocked}
            onChange={(event) =>
              onGroupMetaChange({ ...groupMeta, description: event.target.value })
            }
          />

          <Stack spacing={0.75}>
            <Typography variant="body2" color="text.secondary">
              默认模式
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={groupMeta.defaultMode}
              disabled={isLocked}
              aria-label="默认对比模式"
              onChange={(_event, nextMode: ViewerMode | null) => {
                if (nextMode) onGroupMetaChange({ ...groupMeta, defaultMode: nextMode });
              }}
              sx={{
                height: webUploadSizes.controlHeight,
                "& .MuiToggleButton-root": {
                  minWidth: 0,
                  px: 0.5,
                  borderRadius: webUploadRadii.control,
                  whiteSpace: "nowrap",
                },
              }}
            >
              <ToggleButton value="before-after">滑动</ToggleButton>
              <ToggleButton value="a-b">A / B</ToggleButton>
              <ToggleButton value="heatmap">热图</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}
