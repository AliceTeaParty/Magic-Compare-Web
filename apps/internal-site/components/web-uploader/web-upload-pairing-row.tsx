import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircle,
  DragIndicator,
  ErrorOutlined,
  KeyboardArrowDown,
  WarningAmber,
} from "@mui/icons-material";
import { Box, Collapse, IconButton, Tooltip, Typography } from "@mui/material";
import type { BrowserUploadFile, WebUploadFramePlan } from "./web-upload-types";
import {
  webUploadColors,
  webUploadMotion,
  webUploadRadii,
  webUploadSizes,
  webUploadSurfaces,
} from "./web-upload-design";
import { compactUploadFilename, type FramePreviewRow } from "./web-upload-view-model";

const PANEL_TRANSITION = `background-color ${webUploadMotion.standard}`;
const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

export interface PairingPreviewUrls {
  items: Array<{ key: string; label: string; path: string; url: string }>;
}

function alternateAssetForLabel(frame: WebUploadFramePlan | null, label: string) {
  return frame?.misc.find((asset) => asset.label === label) ?? null;
}

function SmallLazyThumbnail({ alt, source }: { alt: string; source: BrowserUploadFile | null }) {
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

    // Rows can contain hundreds of files, so object URLs exist only near the viewport.
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
          sx={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
    </Box>
  );
}

function ImageCell({
  muted = false,
  path,
  source,
}: {
  path: string | null;
  source: BrowserUploadFile | null;
  muted?: boolean;
}) {
  if (!path) {
    return (
      <Typography variant="body2" noWrap sx={{ color: "text.disabled" }}>
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
      <Typography variant="body2" noWrap sx={{ minWidth: 0, fontVariantNumeric: "tabular-nums" }}>
        {compactUploadFilename(path)}
      </Typography>
    </Box>
  );
}

function IssueStatus({ row }: { row: FramePreviewRow }) {
  if (row.hasError) return <ErrorOutlined color="error" fontSize="small" />;
  if (row.hasWarning) return <WarningAmber color="warning" fontSize="small" />;
  return <CheckCircle color="success" fontSize="small" />;
}

function ExpandedPreview({
  frame,
  urls,
}: {
  frame: WebUploadFramePlan;
  urls: PairingPreviewUrls | null;
}) {
  return (
    <Collapse in={Boolean(urls)} timeout={180} unmountOnExit>
      <Box sx={{ px: { xs: 1, md: 1.25 }, pb: 1.15 }}>
        {urls ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(160px, 1fr))" },
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

/** Owns one sortable row while the parent panel retains sensors and the sortable context. */
export function SortablePairingRow({
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
  previewUrls: PairingPreviewUrls | null;
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
  const desktopGridColumns = `42px 54px minmax(88px, 0.58fr) repeat(${imageColumnCount}, minmax(${imageColumnMin}px, 1fr)) 54px 40px`;

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
        [REDUCED_MOTION]: { transition: "none" },
        "&:last-of-type": { borderBottom: 0 },
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
            xs: "40px 42px minmax(0, 1fr) 24px 40px",
            md: desktopGridColumns,
          },
          gap: { xs: 0.75, md: 1 },
          alignItems: "center",
          px: { xs: 0.75, md: 1.1 },
          py: 0.85,
          cursor: "pointer",
          outline: 0,
          "&:focus-visible": { boxShadow: `inset 0 0 0 2px ${webUploadColors.focusRing}` },
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
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
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
            <Box key={label} sx={{ display: { xs: "none", md: "block" }, minWidth: 0 }}>
              <ImageCell
                muted={!alternate}
                path={alternate?.path ?? null}
                source={alternateAsset?.source ?? null}
              />
            </Box>
          );
        })}
        <Box sx={{ display: "block" }}>
          <IssueStatus row={row} />
        </Box>
        <KeyboardArrowDown
          fontSize="small"
          sx={{
            color: "text.secondary",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: `transform ${webUploadMotion.standard}`,
            [REDUCED_MOTION]: { transition: "none" },
          }}
        />
      </Box>
      {previewFrame ? (
        <ExpandedPreview frame={previewFrame} urls={expanded ? previewUrls : null} />
      ) : null}
    </Box>
  );
}
