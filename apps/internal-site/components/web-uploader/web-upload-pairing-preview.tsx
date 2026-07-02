"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircle,
  DragIndicator,
  KeyboardArrowDown,
  WarningAmber,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Chip,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type {
  BrowserUploadFile,
  WebUploadFramePlan,
  WebUploadPlan,
} from "./web-upload-types";
import {
  frameIdForFrame,
  type FramePreviewRow,
  type PlanView,
} from "./web-upload-view-model";

const PANEL_TRANSITION = "background-color 160ms cubic-bezier(0.22, 1, 0.36, 1)";
const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

interface PreviewUrls {
  beforeUrl: string;
  afterUrl: string;
}

interface ImageCellProps {
  path: string | null;
  source: BrowserUploadFile | null;
  muted?: boolean;
}

interface PairingPreviewPanelProps {
  plan: WebUploadPlan | null;
  planView: PlanView | null;
  canReorder: boolean;
  expandedFrameId: string | null;
  hasBlockingIssues: boolean;
  onExpandedFrameChange: (frameId: string | null) => void;
  onReorder: (activeFrameId: string, overFrameId: string | null) => void;
}

function frameForId(plan: WebUploadPlan | null, frameId: string | null) {
  if (!plan || !frameId) {
    return null;
  }
  return plan.frames.find((frame) => frameIdForFrame(frame) === frameId) ?? null;
}

function alternateAssetForLabel(frame: WebUploadFramePlan | null, label: string) {
  return frame?.misc.find((asset) => asset.label === label) ?? null;
}

function SmallLazyThumbnail({
  alt,
  source,
}: {
  alt: string;
  source: BrowserUploadFile | null;
}) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || isVisible) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "80px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!source || !isVisible) {
      setUrl(null);
      return undefined;
    }

    // The collapsed table may contain hundreds of source files. Create object URLs only after the
    // cell scrolls near the viewport, and revoke them with the row so previews do not become a
    // hidden cache of the entire directory.
    const nextUrl = URL.createObjectURL(source.file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [isVisible, source]);

  return (
    <Box
      ref={rootRef}
      component="span"
      sx={{
        width: 26,
        height: 20,
        flex: "0 0 auto",
        overflow: "hidden",
        borderRadius: 1,
        border: "1px solid",
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.055)",
      }}
    >
      {url ? (
        <Box
          component="img"
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          sx={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : null}
    </Box>
  );
}

function ImageCell({ muted = false, path, source }: ImageCellProps) {
  if (!path) {
    return (
      <Typography variant="body2" color="text.disabled" noWrap>
        —
      </Typography>
    );
  }

  return (
    <Box
      title={path}
      sx={{
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 0.65,
        color: muted ? "text.disabled" : "text.primary",
      }}
    >
      <SmallLazyThumbnail alt={path} source={source} />
      <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
        {path}
      </Typography>
    </Box>
  );
}

function IssueStatus({ row }: { row: FramePreviewRow }) {
  if (row.hasError) {
    return <Typography aria-label="错误">⛔</Typography>;
  }
  if (row.hasWarning) {
    return <Typography aria-label="警告">⚠️</Typography>;
  }
  return <Typography aria-label="可用">✅</Typography>;
}

function ExpandedPreview({
  frame,
  urls,
}: {
  frame: WebUploadFramePlan;
  urls: PreviewUrls | null;
}) {
  return (
    <Collapse in={Boolean(urls)} timeout={180} unmountOnExit>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 1,
          px: { xs: 1, md: 1.25 },
          pb: 1.15,
        }}
      >
        {urls ? (
          [
            { label: "Before", src: urls.beforeUrl, path: frame.before.source.relativePath },
            { label: "After", src: urls.afterUrl, path: frame.after.source.relativePath },
          ].map((preview) => (
            <Box
              key={preview.label}
              sx={{
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1.5,
                backgroundColor: "rgba(255,255,255,0.035)",
              }}
            >
              <Box
                component="img"
                src={preview.src}
                alt={`${frame.title} ${preview.label}`}
                sx={{
                  display: "block",
                  width: "100%",
                  aspectRatio: "16 / 9",
                  objectFit: "cover",
                }}
              />
              <Typography
                variant="caption"
                noWrap
                title={preview.path}
                sx={{ display: "block", px: 1, py: 0.65, color: "text.secondary" }}
              >
                {preview.path}
              </Typography>
            </Box>
          ))
        ) : null}
      </Box>
    </Collapse>
  );
}

function SortablePairingRow({
  row,
  alternateColumns,
  disabled,
  expanded,
  previewFrame,
  previewUrls,
  onToggleExpanded,
}: {
  row: FramePreviewRow;
  alternateColumns: string[];
  disabled: boolean;
  expanded: boolean;
  previewFrame: WebUploadFramePlan | null;
  previewUrls: PreviewUrls | null;
  onToggleExpanded: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: row.frameId,
    disabled,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const imageColumnCount = 2 + alternateColumns.length;
  const imageColumnMin = alternateColumns.length >= 2 ? 118 : 150;
  const desktopGridColumns = `38px 54px minmax(88px, 0.58fr) repeat(${imageColumnCount}, minmax(${imageColumnMin}px, 1fr)) 54px 34px`;

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        borderBottom: "1px solid",
        borderColor: "rgba(255,255,255,0.075)",
        backgroundColor: expanded ? "rgba(232,198,246,0.075)" : "transparent",
        transition: PANEL_TRANSITION,
        "&:hover": {
          backgroundColor: expanded
            ? "rgba(232,198,246,0.09)"
            : "rgba(255,255,255,0.035)",
        },
        [REDUCED_MOTION]: {
          transition: "none",
        },
        "&:last-of-type": {
          borderBottom: 0,
        },
      }}
    >
      <Box
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggleExpanded();
          }
        }}
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "34px 44px minmax(0, 1fr) 32px",
            md: desktopGridColumns,
          },
          gap: { xs: 0.75, md: 1 },
          alignItems: "center",
          px: { xs: 0.75, md: 1.1 },
          py: 0.85,
          cursor: "pointer",
          outline: 0,
          "&:focus-visible": {
            boxShadow: "inset 0 0 0 2px rgba(232,198,246,0.58)",
          },
        }}
      >
        <Tooltip title={disabled ? "扫描完成后可调整顺序" : "拖动调整上传顺序"}>
          <span>
            <IconButton
              {...attributes}
              {...listeners}
              aria-label="拖动调整上传顺序"
              disabled={disabled}
              size="small"
              onClick={(event) => event.stopPropagation()}
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1.5,
                border: 0,
                backgroundColor: "transparent",
              }}
            >
              <DragIndicator fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="body2" color="text.secondary">
          {String(row.order + 1).padStart(3, "0")}
        </Typography>
        <Typography variant="body2" noWrap title={row.title}>
          {row.title}
        </Typography>
        <Box sx={{ display: { xs: "none", md: "block" }, minWidth: 0 }}>
          <ImageCell path={row.beforePath} source={previewFrame?.before.source ?? null} />
        </Box>
        <Box sx={{ display: { xs: "none", md: "block" }, minWidth: 0 }}>
          <ImageCell path={row.afterPath} source={previewFrame?.after.source ?? null} />
        </Box>
        {alternateColumns.map((label) => {
          const alternate = row.alternateAfter.find((item) => item.label === label);
          const alternateAsset = alternateAssetForLabel(previewFrame, label);
          return (
            <Box
              key={label}
              sx={{ display: { xs: "none", md: "block" }, minWidth: 0 }}
            >
              <ImageCell
                muted={!alternate}
                path={alternate?.path ?? null}
                source={alternateAsset?.source ?? null}
              />
            </Box>
          );
        })}
        <Box sx={{ display: { xs: "none", md: "block" } }}>
          <IssueStatus row={row} />
        </Box>
        <KeyboardArrowDown
          fontSize="small"
          sx={{
            color: "text.secondary",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 160ms cubic-bezier(0.22, 1, 0.36, 1)",
            [REDUCED_MOTION]: {
              transition: "none",
            },
          }}
        />
      </Box>
      {previewFrame ? (
        <ExpandedPreview frame={previewFrame} urls={expanded ? previewUrls : null} />
      ) : null}
    </Box>
  );
}

export function PairingPreviewPanel({
  plan,
  planView,
  canReorder,
  expandedFrameId,
  hasBlockingIssues,
  onExpandedFrameChange,
  onReorder,
}: PairingPreviewPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const expandedFrame = frameForId(plan, expandedFrameId);
  const [previewUrls, setPreviewUrls] = useState<PreviewUrls | null>(null);
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
  const desktopGridColumns = `38px 54px minmax(88px, 0.58fr) repeat(${imageColumnCount}, minmax(${imageColumnMin}px, 1fr)) 54px 34px`;

  useEffect(() => {
    if (!expandedFrame) {
      setPreviewUrls(null);
      return undefined;
    }

    // Large upload directories can contain hundreds of frames. Keep object URLs scoped to the one
    // expanded row so preview inspection does not pin every source image in memory.
    const beforeUrl = URL.createObjectURL(expandedFrame.before.source.file);
    const afterUrl = URL.createObjectURL(expandedFrame.after.source.file);
    setPreviewUrls({ beforeUrl, afterUrl });
    return () => {
      URL.revokeObjectURL(beforeUrl);
      URL.revokeObjectURL(afterUrl);
    };
  }, [expandedFrame]);

  function handleDragEnd(event: DragEndEvent) {
    onReorder(String(event.active.id), event.over ? String(event.over.id) : null);
  }

  return (
    <Paper
      elevation={0}
      sx={{
        minHeight: { xs: 420, lg: "calc(100vh - 156px)" },
        maxHeight: { lg: "calc(100vh - 156px)" },
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ px: { xs: 1.7, md: 2 }, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}
      >
        <Typography variant="h6">配对预览</Typography>
        {planView ? (
          <Chip
            icon={hasBlockingIssues ? <WarningAmber /> : <CheckCircle />}
            label={`${planView.healthyPairCount} / ${planView.frames.length}`}
            color={hasBlockingIssues ? "warning" : "primary"}
            sx={{ height: 32 }}
          />
        ) : null}
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {planView && planView.frames.length > 0 ? (
          <DndContext
            // Keep dnd-kit aria ids stable across SSR/hydration and hot reloads.
            id="web-upload-pairing-preview"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={frameIds} strategy={verticalListSortingStrategy}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "34px 44px minmax(0, 1fr) 32px",
                    md: desktopGridColumns,
                  },
                  gap: { xs: 0.75, md: 1 },
                  px: { xs: 0.75, md: 1.1 },
                  py: 0.85,
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  color: "text.secondary",
                  backgroundColor: "rgba(10, 24, 51, 0.97)",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  fontSize: 13,
                }}
              >
                <span />
                <span>序号</span>
                <span>Frame</span>
                <Box component="span" sx={{ display: { xs: "none", md: "block" } }}>
                  Before
                </Box>
                <Box component="span" sx={{ display: { xs: "none", md: "block" } }}>
                  After
                </Box>
                {alternateColumns.map((label) => (
                  <Box key={label} component="span" sx={{ display: { xs: "none", md: "block" } }}>
                    {label}
                  </Box>
                ))}
                <Box component="span" sx={{ display: { xs: "none", md: "block" } }}>
                  状态
                </Box>
                <span />
              </Box>
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
        ) : (
          <Typography color="text.secondary" sx={{ px: 2, py: 2.5 }}>
            选择文件夹后显示配对结果。
          </Typography>
        )}
      </Box>

      {planView?.issues.length ? (
        <Stack spacing={0.7} sx={{ px: 1.5, py: 1.25, borderTop: "1px solid", borderColor: "divider" }}>
          {planView.issues.slice(0, 3).map((issue, index) => (
            <Alert key={`${issue.path}-${index}`} severity={issue.severity} sx={{ py: 0.45 }}>
              {issue.message}
              <Typography variant="caption" sx={{ display: "block", opacity: 0.75 }}>
                {issue.path}
              </Typography>
            </Alert>
          ))}
          {planView.issues.length > 3 ? (
            <Typography variant="caption" color="text.secondary">
              还有 {planView.issues.length - 3} 个问题未显示。
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Paper>
  );
}
