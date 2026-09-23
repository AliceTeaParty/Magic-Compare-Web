"use client";

import { useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CheckCircle, ErrorOutlined, WarningAmber } from "@mui/icons-material";
import {
  Alert,
  Box,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Stack,
  ToggleButton,
  Typography,
} from "@mui/material";
import { MagicSegmentedControl } from "@magic-compare/ui";
import { FluentFolderEmoji } from "../fluent-emoji";
import { PairingTableHeader } from "./web-upload-pairing-header";
import { SortablePairingRow, type PairingPreviewUrls } from "./web-upload-pairing-row";
import type { WebUploadPlan } from "./web-upload-types";
import { webUploadPanelSx, webUploadRadii, webUploadSizes } from "./web-upload-design";
import {
  frameIdForFrame,
  type FrameTitleMode,
  type PlanView,
  type UploadPlanImageColumn,
} from "./web-upload-view-model";

interface PairingPreviewPanelProps {
  plan: WebUploadPlan | null;
  planView: PlanView | null;
  canReorder: boolean;
  expandedFrameId: string | null;
  frameTitleMode: FrameTitleMode;
  hasBlockingIssues: boolean;
  onExpandedFrameChange: (frameId: string | null) => void;
  onFrameTitleModeChange: (mode: FrameTitleMode) => void;
  onHeatmapReferenceChange: (label: string) => void;
  onRenameColumn: (column: UploadPlanImageColumn, nextLabel: string) => void;
  onReorder: (activeFrameId: string, overFrameId: string | null) => void;
}

function frameForId(plan: WebUploadPlan | null, frameId: string | null) {
  if (!plan || !frameId) {
    return null;
  }
  return plan.frames.find((frame) => frameIdForFrame(frame) === frameId) ?? null;
}

function compactHeatmapReference(label: string) {
  return label.length > 15 ? `${label.slice(0, 12)}...` : label;
}

/**
 * Coordinates pairing controls, DnD sensors, and the one expanded preview URL set. Column editing
 * and sortable row rendering live in focused child modules so this component owns only the table.
 */
export function PairingPreviewPanel({
  plan,
  planView,
  canReorder,
  expandedFrameId,
  frameTitleMode,
  hasBlockingIssues,
  onExpandedFrameChange,
  onFrameTitleModeChange,
  onHeatmapReferenceChange,
  onRenameColumn,
  onReorder,
}: PairingPreviewPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const expandedFrame = frameForId(plan, expandedFrameId);
  const [previewUrls, setPreviewUrls] = useState<PairingPreviewUrls | null>(null);
  const frameIds = useMemo(
    () => planView?.frames.map((row) => row.frameId) ?? [],
    [planView?.frames],
  );
  const alternateColumns = useMemo(() => {
    const labels = new Set<string>();
    for (const row of planView?.frames ?? []) {
      for (const alternate of row.alternateAfter) {
        if (labels.size < 3) {
          labels.add(alternate.label);
        }
      }
    }
    return [...labels];
  }, [planView?.frames]);
  const imageColumnCount = 2 + alternateColumns.length;
  const imageColumnMin = alternateColumns.length >= 2 ? 118 : 150;
  const desktopGridColumns = `42px 54px minmax(88px, 0.58fr) repeat(${imageColumnCount}, minmax(${imageColumnMin}px, 1fr)) 54px 40px`;

  useEffect(() => {
    if (!expandedFrame) {
      setPreviewUrls(null);
      return undefined;
    }

    // Keep object URLs scoped to the expanded row so large plans do not pin every source image.
    const previewItems = [
      { key: "before", label: expandedFrame.before.label, asset: expandedFrame.before },
      { key: "after", label: expandedFrame.after.label, asset: expandedFrame.after },
      ...expandedFrame.misc.map((asset, index) => ({
        key: `misc-${index}`,
        label: asset.label,
        asset,
      })),
    ].map((item) => ({
      key: item.key,
      label: item.label,
      path: item.asset.source.relativePath,
      url: URL.createObjectURL(item.asset.source.file),
    }));
    setPreviewUrls({ items: previewItems });
    return () => {
      for (const item of previewItems) {
        URL.revokeObjectURL(item.url);
      }
    };
  }, [expandedFrame]);

  function handleDragEnd(event: DragEndEvent) {
    onReorder(String(event.active.id), event.over ? String(event.over.id) : null);
  }

  return (
    <Paper
      elevation={0}
      sx={{
        minHeight: { xs: 320, lg: "calc(100vh - 252px)" },
        maxHeight: { lg: "calc(100vh - 224px)" },
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...webUploadPanelSx,
        p: 0,
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, auto) minmax(0, 1fr)" },
          alignItems: "center",
          gap: 1,
          px: { xs: 1.7, md: 2 },
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack direction="row" spacing={0.7} sx={{ alignItems: "center", minWidth: 0 }}>
          <Typography component="h2" variant="h4">
            配对
          </Typography>
          {planView ? (
            <>
              {hasBlockingIssues ? (
                <WarningAmber aria-hidden="true" color="warning" sx={{ fontSize: 18 }} />
              ) : (
                <CheckCircle aria-hidden="true" color="success" sx={{ fontSize: 18 }} />
              )}
              <Typography variant="body2" color="text.secondary" noWrap>
                {planView.frames.length} Frame
              </Typography>
            </>
          ) : null}
        </Stack>
        {planView ? (
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
              alignItems: "center",
              justifyContent: { xs: "flex-start", md: "flex-end" },
              minWidth: 0,
            }}
          >
            {/* This explicit fallback exposes filename titles when structured inference is wrong. */}
            <MagicSegmentedControl
              exclusive
              size="small"
              value={frameTitleMode}
              disabled={!canReorder}
              aria-label="Frame 标题格式"
              onChange={(_event, nextMode: FrameTitleMode | null) => {
                if (nextMode) onFrameTitleModeChange(nextMode);
              }}
              sx={{
                height: webUploadSizes.compactControlHeight,
                width: 168,
                "& .MuiToggleButton-root": {
                  flex: "1 1 0",
                  minWidth: 0,
                  px: 0.5,
                  py: 0,
                  borderRadius: webUploadRadii.control,
                  fontSize: 12,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  wordBreak: "keep-all",
                },
              }}
            >
              <ToggleButton value="inferred" aria-label="自动 Frame 标题">
                自动
              </ToggleButton>
              <ToggleButton value="filename" aria-label="文件名 Frame 标题">
                文件名
              </ToggleButton>
            </MagicSegmentedControl>
            <FormControl size="small" variant="outlined" sx={{ width: 164, flex: "0 1 164px" }}>
              <Select
                // Incomplete pairs have no valid reference option yet; avoid an out-of-range selection.
                value={
                  planView.heatmapReferenceOptions.includes(planView.heatmapReferenceLabel ?? "")
                    ? planView.heatmapReferenceLabel
                    : ""
                }
                inputProps={{ "aria-label": "Heatmap 参考变量" }}
                onChange={(event) => onHeatmapReferenceChange(event.target.value)}
                disabled={!canReorder || planView.heatmapReferenceOptions.length <= 1}
                displayEmpty
                renderValue={(value) =>
                  value ? `Heatmap: ${compactHeatmapReference(value)}` : "Heatmap"
                }
                sx={{
                  height: webUploadSizes.compactControlHeight,
                  width: "100%",
                  minWidth: 0,
                  borderRadius: webUploadRadii.control,
                  "& .MuiSelect-select": {
                    py: 0.45,
                    pl: "30px !important",
                    pr: "30px !important",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "center",
                    fontSize: 13,
                  },
                }}
              >
                {planView.heatmapReferenceOptions.map((label) => (
                  <MenuItem key={label} value={label}>
                    Heatmap: {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {hasBlockingIssues ? (
              <Typography variant="body2" color="warning.main" sx={{ whiteSpace: "nowrap" }}>
                {planView.errorCount} 问题
              </Typography>
            ) : null}
          </Box>
        ) : null}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {planView && planView.frames.length > 0 ? (
          <DndContext
            id="web-upload-pairing-preview"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={frameIds} strategy={verticalListSortingStrategy}>
              <PairingTableHeader
                alternateColumns={alternateColumns}
                canEdit={canReorder}
                desktopGridColumns={desktopGridColumns}
                onRenameColumn={onRenameColumn}
                planView={planView}
              />
              {planView.frames.map((row) => (
                <SortablePairingRow
                  key={row.frameId}
                  row={row}
                  alternateColumns={alternateColumns}
                  disabled={!canReorder}
                  expanded={expandedFrameId === row.frameId}
                  previewFrame={frameForId(plan, row.frameId)}
                  previewUrls={expandedFrameId === row.frameId ? previewUrls : null}
                  onToggleExpanded={() =>
                    onExpandedFrameChange(expandedFrameId === row.frameId ? null : row.frameId)
                  }
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : planView ? (
          <Stack
            sx={{
              alignItems: "center",
              justifyContent: "center",
              minHeight: 240,
              px: 2,
              py: 4,
              textAlign: "center",
            }}
            spacing={1}
          >
            <ErrorOutlined color="warning" sx={{ fontSize: 42 }} />
            <Typography variant="h4">没有可用 Frame</Typography>
          </Stack>
        ) : (
          <Stack
            sx={{
              alignItems: "center",
              justifyContent: "center",
              minHeight: 220,
              px: 2,
              py: 4,
              textAlign: "center",
            }}
            spacing={1}
          >
            <FluentFolderEmoji size={64} />
            <Typography variant="h4">等待素材目录</Typography>
          </Stack>
        )}
      </Box>

      {planView?.issues.length ? (
        <Stack
          spacing={0.7}
          sx={{ px: 1.5, py: 1.25, borderTop: "1px solid", borderColor: "divider" }}
        >
          {planView.issues.slice(0, 3).map((issue, index) => (
            <Alert key={`${issue.path}-${index}`} severity={issue.severity} sx={{ py: 0.45 }}>
              {issue.message}
              <Typography variant="caption" sx={{ display: "block", opacity: 0.75 }}>
                {issue.path}
              </Typography>
            </Alert>
          ))}
          {planView.issues.length > 3 ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              还有 {planView.issues.length - 3} 个问题未显示。
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Paper>
  );
}
