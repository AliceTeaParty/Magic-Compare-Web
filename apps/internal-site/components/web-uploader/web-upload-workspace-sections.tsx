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
  Autocomplete,
  Box,
  Button,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_TITLE_MAX_LENGTH,
} from "@magic-compare/content-schema";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";
import { CaseCreateButton } from "../case-create-button";
import { FluentFolderEmoji } from "../fluent-emoji";
import type { GenerationProgress } from "./asset-generator";
import {
  webUploadFieldSx,
  webUploadPanelSx,
  webUploadSizes,
  webUploadSurfaces,
} from "./web-upload-design";
import type { UploadRunnerSnapshot } from "./web-upload-types";
import type { PlanView } from "./web-upload-view-model";
import type { UploadPairingSuffixPreferences } from "./source-scanner";

export interface UploadGroupMeta {
  slug: string;
  title: string;
  description: string;
}

/** Keeps case selection searchable once an internal catalog has more entries than a short menu. */
function TargetCaseField({
  cases,
  disabled = false,
  onChange,
  selectedCaseSlug,
}: {
  cases: CaseCatalogItem[];
  disabled?: boolean;
  onChange: (caseSlug: string) => void;
  selectedCaseSlug: string;
}) {
  const selectedCase = cases.find((item) => item.slug === selectedCaseSlug) ?? null;

  return (
    <Autocomplete
      autoHighlight
      disabled={disabled}
      getOptionLabel={(item) => item.title}
      isOptionEqualToValue={(left, right) => left.slug === right.slug}
      onChange={(_event, nextCase) => {
        if (nextCase) onChange(nextCase.slug);
      }}
      options={cases}
      renderInput={(params) => <TextField {...params} label="目标项目" size="small" />}
      value={selectedCase}
    />
  );
}

/** Captures naming conventions before directory selection and preserves them for a later re-scan. */
function PairingSuffixFields({
  disabled = false,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (nextValue: UploadPairingSuffixPreferences) => void;
  value: UploadPairingSuffixPreferences;
}) {
  return (
    <Stack direction="row" spacing={1}>
      <TextField
        disabled={disabled}
        fullWidth
        helperText="例：output"
        label="Before - 后缀"
        onChange={(event) => onChange({ ...value, before: event.target.value })}
        size="small"
        value={value.before}
      />
      <TextField
        disabled={disabled}
        fullWidth
        helperText="例：rip"
        label="After - 后缀"
        onChange={(event) => onChange({ ...value, after: event.target.value })}
        size="small"
        value={value.after}
      />
    </Stack>
  );
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

/** Keeps the workflow readable in the narrow supporting column without splitting it into separate cards. */
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
        ...webUploadPanelSx,
        position: "relative",
        overflow: "hidden",
        py: 1.7,
      }}
    >
      <Box
        role="list"
        sx={{
          position: "relative",
          display: "grid",
          gap: 0.9,
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            top: webUploadSizes.flowMarker / 2,
            bottom: webUploadSizes.flowMarker / 2,
            left: webUploadSizes.flowMarker / 2,
            width: 2,
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
              transform: `scaleY(${flow.progress / 100})`,
              transformOrigin: "center top",
              transition: "transform 300ms cubic-bezier(0.2, 0, 0, 1)",
              "@media (prefers-reduced-motion: reduce)": { transition: "none" },
            }}
          />
        </Box>

        {FLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          const completed = index < flow.activeIndex || snapshot.stage === "completed";
          const active = index === flow.activeIndex && snapshot.stage !== "completed";
          const failed = index === flow.failedIndex;

          return (
            <Box
              key={step.label}
              role="listitem"
              sx={{
                display: "grid",
                gridTemplateColumns: `${webUploadSizes.flowMarker}px minmax(0, 1fr) auto`,
                alignItems: "center",
                columnGap: 1,
                minWidth: 0,
              }}
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
                sx={{ minWidth: 0, fontWeight: active ? 700 : 550 }}
              >
                {step.label}
              </Typography>
              <Typography
                variant="caption"
                noWrap
                title={flow.details[index]}
                sx={{
                  color: "text.secondary",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {flow.details[index]}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

/** Source selection is the only initial decision; destination and pairing belong to the scanned plan. */
export function UploadIntakePanel({
  isScanning,
  onChooseDirectory,
}: {
  isScanning: boolean;
  onChooseDirectory: () => void;
}) {
  return (
    <Paper
      component="section"
      elevation={0}
      sx={{ ...webUploadPanelSx, minHeight: 360, display: "grid", placeItems: "center" }}
    >
      <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center", py: 5 }}>
        <FluentFolderEmoji size={72} />
        <Typography component="h2" variant="h3">
          素材目录
        </Typography>
        <Button
          variant="contained"
          startIcon={<FolderOpenRounded />}
          loading={isScanning}
          onClick={onChooseDirectory}
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
  onPairingSuffixPreferencesChange,
  pairingSuffixPreferences,
  selectedCaseSlug,
  sourceRootName,
}: {
  cases: CaseCatalogItem[];
  groupMeta: UploadGroupMeta;
  isLocked: boolean;
  onCaseChange: (caseSlug: string) => void;
  onChooseDirectory: () => void;
  onGroupMetaChange: (nextMeta: UploadGroupMeta) => void;
  onPairingSuffixPreferencesChange: (nextValue: UploadPairingSuffixPreferences) => void;
  pairingSuffixPreferences: UploadPairingSuffixPreferences;
  selectedCaseSlug: string;
  sourceRootName: string;
}) {
  return (
    <Paper
      elevation={0}
      sx={{ ...webUploadPanelSx, ...webUploadFieldSx, p: 0, overflow: "hidden" }}
    >
      {/* The source is the card identity; a fixed header separates it from editable upload metadata. */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, px: 2.25, py: 1.75 }}>
        <FolderOpenRounded color="primary" sx={{ fontSize: 23, flexShrink: 0 }} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h2" variant="h4" noWrap title={sourceRootName}>
            {sourceRootName}
          </Typography>
        </Box>
        <Tooltip title="重新选择文件夹">
          <span>
            <IconButton aria-label="重新选择文件夹" disabled={isLocked} onClick={onChooseDirectory}>
              <FolderOpenRounded />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Divider />
      <Stack spacing={2.1} sx={{ p: 2.25 }}>
        {cases.length ? (
          <TargetCaseField
            cases={cases}
            disabled={isLocked}
            onChange={onCaseChange}
            selectedCaseSlug={selectedCaseSlug}
          />
        ) : (
          <Stack spacing={1}>
            <Alert severity="warning">上传前需要创建项目。</Alert>
            <CaseCreateButton />
          </Stack>
        )}
        <PairingSuffixFields
          disabled={isLocked}
          onChange={onPairingSuffixPreferencesChange}
          value={pairingSuffixPreferences}
        />
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
          helperText={`${groupMeta.title.length}/${GROUP_TITLE_MAX_LENGTH}`}
          slotProps={{ htmlInput: { maxLength: GROUP_TITLE_MAX_LENGTH } }}
          onChange={(event) => onGroupMetaChange({ ...groupMeta, title: event.target.value })}
        />
        <TextField
          label="描述"
          size="small"
          multiline
          minRows={2}
          value={groupMeta.description}
          disabled={isLocked}
          helperText={`${groupMeta.description.length}/${GROUP_DESCRIPTION_MAX_LENGTH}`}
          slotProps={{ htmlInput: { maxLength: GROUP_DESCRIPTION_MAX_LENGTH } }}
          onChange={(event) => onGroupMetaChange({ ...groupMeta, description: event.target.value })}
        />
      </Stack>
    </Paper>
  );
}
