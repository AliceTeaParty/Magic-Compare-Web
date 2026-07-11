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
  Check,
  CheckCircle,
  Close,
  DragIndicator,
  EditOutlined,
  KeyboardArrowDown,
  WarningAmber,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select,
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
  webUploadColors,
  webUploadMotion,
  webUploadPanelSx,
  webUploadRadii,
  webUploadSizes,
  webUploadSurfaces,
} from "./web-upload-design";
import {
  frameIdForFrame,
  compactUploadFilename,
  type FramePreviewRow,
  type PlanView,
  type UploadPlanImageColumn,
} from "./web-upload-view-model";

const PANEL_TRANSITION = `background-color ${webUploadMotion.standard}`;
const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

interface PreviewUrls {
  items: Array<{ key: string; label: string; path: string; url: string }>;
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
  onHeatmapReferenceChange: (label: string) => void;
  onFallbackFrameTitles: () => void;
  onRenameColumn: (column: UploadPlanImageColumn, nextLabel: string) => void;
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
      { rootMargin: "720px" },
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
        width: webUploadSizes.tinyThumbnailWidth,
        height: webUploadSizes.tinyThumbnailHeight,
        flex: "0 0 auto",
        overflow: "hidden",
        borderRadius: webUploadRadii.thumbnail,
        border: "1px solid",
        borderColor: webUploadSurfaces.thumbnailBorder,
        backgroundColor: webUploadSurfaces.controlBackground,
      }}
    >
      {url ? (
        <Box
          component="img"
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
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
      <Typography
        variant="body2"
        noWrap
        sx={{
          minWidth: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {compactUploadFilename(path)}
      </Typography>
    </Box>
  );
}

function IssueStatus({ row }: { row: FramePreviewRow }) {
  if (row.hasError) {
    return <Typography aria-label="错误" sx={{ userSelect: "none" }}>⛔</Typography>;
  }
  if (row.hasWarning) {
    return <Typography aria-label="警告" sx={{ userSelect: "none" }}>⚠️</Typography>;
  }
  return <Typography aria-label="可用" sx={{ userSelect: "none" }}>✅</Typography>;
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
          px: { xs: 1, md: 1.25 },
          pb: 1.15,
        }}
      >
        {urls ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(auto-fit, minmax(160px, 1fr))",
              },
              gap: 1,
            }}
          >
            {urls.items.map((preview) => (
              <Box
                key={preview.key}
                sx={{
                  overflow: "hidden",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: webUploadRadii.control,
                  backgroundColor: webUploadSurfaces.row,
                }}
              >
                <Box
                  component="img"
                  src={preview.url}
                  alt={`${frame.title} ${preview.label}`}
                  decoding="async"
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
                  {preview.label} · {compactUploadFilename(preview.path)}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : null}
      </Box>
    </Collapse>
  );
}

function EditableColumnHeader({
  canEdit,
  label,
  onRename,
}: {
  canEdit: boolean;
  label: string;
  onRename: (currentLabel: string, nextLabel: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  useEffect(() => {
    if (!editing) {
      setDraft(label);
    }
  }, [editing, label]);

  function save() {
    const nextLabel = draft.trim();
    if (nextLabel && nextLabel !== label) {
      onRename(label, nextLabel);
    }
    setEditing(false);
  }

  if (!canEdit) {
    return <>{label}</>;
  }

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.35, minWidth: 0 }}>
      {editing ? (
        <>
          <Box
            component="input"
            value={draft}
            aria-label={`编辑 ${label} 列名`}
            onChange={(event) => setDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setEditing(false);
              }
            }}
            sx={{
              width: "9ch",
              minWidth: 0,
              border: 0,
              borderBottom: "1px solid currentColor",
              outline: 0,
              p: 0,
              color: "inherit",
              background: "transparent",
              font: "inherit",
            }}
          />
          <IconButton
            aria-label="保存列名"
            size="small"
            onClick={save}
            sx={{ width: webUploadSizes.inlineIconButton, height: webUploadSizes.inlineIconButton }}
          >
            <Check sx={{ fontSize: 15 }} />
          </IconButton>
          <IconButton
            aria-label="取消编辑列名"
            size="small"
            onClick={() => setEditing(false)}
            sx={{ width: webUploadSizes.inlineIconButton, height: webUploadSizes.inlineIconButton }}
          >
            <Close sx={{ fontSize: 15 }} />
          </IconButton>
        </>
      ) : (
        <>
          <Typography component="span" variant="inherit" noWrap sx={{ minWidth: 0 }}>
            {label}
          </Typography>
          <IconButton
            aria-label={`编辑 ${label} 列名`}
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              setEditing(true);
            }}
            sx={{
              width: webUploadSizes.inlineIconButton,
              height: webUploadSizes.inlineIconButton,
              opacity: 0.72,
              "&:hover": { opacity: 1 },
            }}
          >
            <EditOutlined sx={{ fontSize: 14 }} />
          </IconButton>
        </>
      )}
    </Box>
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
        borderColor: webUploadSurfaces.subtleBorder,
        backgroundColor: expanded ? webUploadSurfaces.rowSelected : "transparent",
        transition: PANEL_TRANSITION,
        "&:hover": {
          backgroundColor: expanded
            ? webUploadSurfaces.rowSelectedHover
            : webUploadSurfaces.rowHover,
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
            boxShadow: `inset 0 0 0 2px ${webUploadColors.focusRing}`,
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
                width: webUploadSizes.dragHandleButton,
                height: webUploadSizes.dragHandleButton,
                borderRadius: webUploadRadii.control,
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
            transition: `transform ${webUploadMotion.standard}`,
            [REDUCED_MOTION]: {
              transition: "none",
            },
          }}
        />
      </Box>
      {previewFrame ? (
        <ExpandedPreview
          frame={previewFrame}
          urls={expanded ? previewUrls : null}
        />
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
  onHeatmapReferenceChange,
  onFallbackFrameTitles,
  onRenameColumn,
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
        minHeight: { xs: 420, lg: "calc(100vh - 156px)" },
        maxHeight: { lg: "calc(100vh - 156px)" },
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...webUploadPanelSx,
        p: 0,
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
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              variant="outlined"
              onClick={onFallbackFrameTitles}
              disabled={!canReorder}
              sx={{ height: webUploadSizes.compactControlHeight, borderRadius: webUploadRadii.control }}
            >
              使用完整 m2ts-帧号
            </Button>
            {planView.heatmapReferenceOptions.length > 1 ? (
              <FormControl size="small" variant="outlined">
                <Select
                  value={planView.heatmapReferenceLabel}
                  onChange={(event) => onHeatmapReferenceChange(event.target.value)}
                  disabled={!canReorder}
                  displayEmpty
                  sx={{
                    height: webUploadSizes.compactControlHeight,
                    minWidth: 132,
                    borderRadius: webUploadRadii.control,
                    "& .MuiSelect-select": {
                      py: 0.45,
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
            ) : null}
            <Chip
              icon={hasBlockingIssues ? <WarningAmber /> : <CheckCircle />}
              label={`${planView.healthyPairCount} / ${planView.frames.length}`}
              color={hasBlockingIssues ? "warning" : "primary"}
              sx={{ height: webUploadSizes.compactControlHeight }}
            />
          </Stack>
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
                  backgroundColor: webUploadSurfaces.stickyHeader,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  fontSize: 13,
                }}
              >
                <span />
                <span>序号</span>
                <span>Frame</span>
                <Box component="span" sx={{ display: { xs: "none", md: "block" } }}>
                  <EditableColumnHeader
                    canEdit={canReorder}
                    label={planView.beforeLabel}
                    onRename={(_label, nextLabel) => onRenameColumn({ kind: "before" }, nextLabel)}
                  />
                </Box>
                <Box component="span" sx={{ display: { xs: "none", md: "block" } }}>
                  <EditableColumnHeader
                    canEdit={canReorder}
                    label={planView.afterLabel}
                    onRename={(_label, nextLabel) => onRenameColumn({ kind: "after" }, nextLabel)}
                  />
                </Box>
                {alternateColumns.map((label) => (
                  <Box key={label} component="span" sx={{ display: { xs: "none", md: "block" } }}>
                    <EditableColumnHeader
                      canEdit={canReorder}
                      label={label}
                      onRename={(_label, nextLabel) => onRenameColumn({ kind: "misc", label }, nextLabel)}
                    />
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
