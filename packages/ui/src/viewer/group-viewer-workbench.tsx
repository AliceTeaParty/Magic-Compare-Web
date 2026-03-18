"use client";

import {
  Fullscreen,
  FullscreenExit,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  Layers,
  PhotoLibrary,
  Tune,
  ViewSidebar,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Link as MuiLink,
  Paper,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import useEmblaCarousel from "embla-carousel-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";
import type { ViewerMode } from "@magic-compare/content-schema";
import { clampNumber, formatUtcDate } from "@magic-compare/shared-utils";
import { useViewerController } from "@magic-compare/compare-core/use-viewer-controller";
import type {
  ViewerAsset,
  ViewerDataset,
  ViewerFrame,
  ViewerGroup,
} from "@magic-compare/compare-core/viewer-data";

interface GroupViewerWorkbenchProps {
  dataset: ViewerDataset;
  variant: "public" | "internal";
  onFrameReorder?: (frameIds: string[]) => Promise<void>;
}

interface ThumbnailButtonProps {
  frame: ViewerFrame;
  isActive: boolean;
  onClick: () => void;
}

function resolveThumbnailAsset(frame: ViewerFrame): ViewerAsset | undefined {
  return (
    frame.assets.find((asset) => asset.kind === "after" && asset.isPrimaryDisplay) ??
    frame.assets.find((asset) => asset.kind === "before" && asset.isPrimaryDisplay) ??
    frame.assets[0]
  );
}

function ThumbnailButton({ frame, isActive, onClick }: ThumbnailButtonProps) {
  const thumbAsset = resolveThumbnailAsset(frame);

  return (
    <Button
      onClick={onClick}
      sx={{
        minWidth: 172,
        maxWidth: 172,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 1,
        borderRadius: 2.5,
        border: "1px solid",
        borderColor: isActive ? "primary.main" : "divider",
        backgroundColor: isActive ? "rgba(140, 193, 255, 0.12)" : "rgba(255, 255, 255, 0.02)",
        p: 1,
      }}
    >
      <Box
        sx={{
          borderRadius: 2,
          overflow: "hidden",
          backgroundColor: "rgba(255,255,255,0.04)",
          aspectRatio: "16 / 9",
        }}
      >
        {thumbAsset ? (
          <Box
            component="img"
            src={thumbAsset.thumbUrl || thumbAsset.imageUrl}
            alt={frame.title}
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
            <PhotoLibrary sx={{ color: "text.secondary" }} />
          </Box>
        )}
      </Box>
      <Stack spacing={0.25} alignItems="flex-start">
        <Typography variant="body2" fontWeight={600} noWrap>
          {frame.title}
        </Typography>
        {frame.caption ? (
          <Typography variant="caption" color="text.secondary" noWrap>
            {frame.caption}
          </Typography>
        ) : null}
      </Stack>
    </Button>
  );
}

function SortableThumbnailItem({
  frame,
  isActive,
  onClick,
}: ThumbnailButtonProps & { frame: ViewerFrame }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: frame.id,
  });

  return (
    <Box
      ref={setNodeRef}
      sx={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <Box {...attributes} {...listeners}>
        <ThumbnailButton frame={frame} isActive={isActive} onClick={onClick} />
      </Box>
    </Box>
  );
}

function StageImage({ asset, alt }: { asset: ViewerAsset; alt: string }) {
  return (
    <Box
      component="img"
      src={asset.imageUrl}
      alt={alt}
      sx={{
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
        display: "block",
        mx: "auto",
      }}
    />
  );
}

function HeatmapNotice() {
  return (
    <Alert
      severity="info"
      sx={{
        borderRadius: 3,
        bgcolor: "rgba(241, 168, 99, 0.1)",
        color: "text.primary",
      }}
    >
      No heatmap for this frame. Viewer has fallen back to a primary compare mode.
    </Alert>
  );
}

function ViewerStage({
  beforeAsset,
  afterAsset,
  heatmapAsset,
  mode,
  abSide,
  overlayOpacity,
  onAbSideChange,
}: {
  beforeAsset: ViewerAsset | undefined;
  afterAsset: ViewerAsset | undefined;
  heatmapAsset: ViewerAsset | undefined;
  mode: ViewerMode;
  abSide: "before" | "after";
  overlayOpacity: number;
  onAbSideChange: (value: "before" | "after") => void;
}) {
  if (!beforeAsset || !afterAsset) {
    return (
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          height: "100%",
          borderRadius: 4,
          border: "1px dashed",
          borderColor: "divider",
        }}
      >
        <Stack spacing={1.5} alignItems="center">
          <PhotoLibrary sx={{ color: "text.secondary" }} />
          <Typography variant="body1">This frame is missing its before/after pair.</Typography>
        </Stack>
      </Box>
    );
  }

  if (mode === "a-b") {
    const visibleAsset = abSide === "before" ? beforeAsset : afterAsset;
    return (
      <Stack spacing={2} sx={{ height: "100%" }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={abSide}
          onChange={(_, next) => {
            if (next) {
              onAbSideChange(next);
            }
          }}
          sx={{ alignSelf: "center" }}
        >
          <ToggleButton value="before">Before</ToggleButton>
          <ToggleButton value="after">After</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1, minHeight: 0, display: "grid", placeItems: "center" }}>
          <StageImage asset={visibleAsset} alt={`${visibleAsset.label} preview`} />
        </Box>
      </Stack>
    );
  }

  if (mode === "heatmap" && heatmapAsset) {
    return (
      <Box sx={{ position: "relative", height: "100%", display: "grid", placeItems: "center" }}>
        <StageImage asset={afterAsset} alt={`${afterAsset.label} base`} />
        <Box
          component="img"
          src={heatmapAsset.imageUrl}
          alt={heatmapAsset.label}
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            opacity: overlayOpacity / 100,
            pointerEvents: "none",
          }}
        />
      </Box>
    );
  }

  return (
    <ReactCompareSlider
      style={{ width: "100%", height: "100%" }}
      itemOne={
        <ReactCompareSliderImage
          src={beforeAsset.imageUrl}
          alt={beforeAsset.label}
          style={{ objectFit: "contain", height: "100%", width: "100%" }}
        />
      }
      itemTwo={
        <ReactCompareSliderImage
          src={afterAsset.imageUrl}
          alt={afterAsset.label}
          style={{ objectFit: "contain", height: "100%", width: "100%" }}
        />
      }
      onlyHandleDraggable
      position={50}
    />
  );
}

function GroupLinks({
  currentGroup,
  groups,
}: {
  currentGroup: ViewerGroup;
  groups: ViewerDataset["siblingGroups"];
}) {
  return (
    <Stack spacing={1}>
      {groups.map((group) => (
        <MuiLink
          key={group.id}
          component={Link}
          href={group.href}
          underline="none"
          sx={{
            color: group.isCurrent ? "primary.main" : "text.secondary",
            fontWeight: group.isCurrent ? 700 : 500,
          }}
        >
          {group.title}
          {group.isCurrent ? " · current" : ""}
        </MuiLink>
      ))}
      {groups.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {currentGroup.title}
        </Typography>
      ) : null}
    </Stack>
  );
}

export function GroupViewerWorkbench({
  dataset,
  variant,
  onFrameReorder,
}: GroupViewerWorkbenchProps) {
  const [frames, setFrames] = useState(dataset.group.frames);
  const [isSavingOrder, startSavingOrder] = useTransition();
  const group = useMemo(
    () => ({
      ...dataset.group,
      frames,
    }),
    [dataset.group, frames],
  );
  const controller = useViewerController(group);
  const frameIds = controller.frames.map((frame) => frame.id);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    dragFree: true,
    align: "start",
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (controller.currentFrameIndex >= 0) {
      emblaApi?.scrollTo(controller.currentFrameIndex);
    }
  }, [controller.currentFrameIndex, emblaApi]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
      ) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        controller.stepFrame(1);
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        controller.stepFrame(-1);
      }

      if (event.key === "1") {
        controller.setMode("before-after");
      }

      if (event.key === "2") {
        controller.setMode("a-b");
      }

      if (event.key === "3") {
        controller.setMode("heatmap");
      }

      if (event.key.toLowerCase() === "i") {
        controller.toggleSidebar();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [controller]);

  useEffect(() => {
    function handleFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (!rootRef.current) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await rootRef.current.requestFullscreen();
    }
  }

  return (
    <Box
      ref={rootRef}
      sx={{
        minHeight: "100vh",
        px: { xs: 1.5, md: 3 },
        py: { xs: 1.5, md: 2.5 },
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 18%), transparent",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          display: "grid",
          gridTemplateColumns: controller.sidebarOpen ? { xs: "1fr", lg: "1fr 320px" } : "1fr",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
          minHeight: "calc(100vh - 32px)",
          overflow: "hidden",
          border: "1px solid rgba(140, 193, 255, 0.12)",
          borderRadius: 5,
          backgroundColor: "rgba(18, 23, 31, 0.86)",
          backdropFilter: "blur(18px)",
        }}
      >
        <Box
          sx={{
            gridColumn: "1 / -1",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            px: { xs: 2, md: 2.5 },
            py: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">
              {variant === "public" ? "Published group" : "Internal workbench"}
            </Typography>
            <Typography variant="h5" noWrap>
              {dataset.group.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {dataset.caseMeta.title}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <ToggleButtonGroup
              exclusive
              size="small"
              value={controller.mode}
              onChange={(_, nextMode: ViewerMode | null) => {
                if (nextMode) {
                  controller.setMode(nextMode);
                }
              }}
            >
              <ToggleButton value="before-after">Before / After</ToggleButton>
              <ToggleButton value="a-b">A / B</ToggleButton>
              <ToggleButton value="heatmap" disabled={!controller.availableModes.includes("heatmap")}>
                Heatmap
              </ToggleButton>
            </ToggleButtonGroup>
            <Tooltip title="Toggle sidebar (I)">
              <IconButton onClick={controller.toggleSidebar}>
                <ViewSidebar />
              </IconButton>
            </Tooltip>
            <Tooltip title="Fullscreen (browser)">
              <IconButton onClick={toggleFullscreen}>
                {fullscreen ? <FullscreenExit /> : <Fullscreen />}
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        <Box
          sx={{
            minWidth: 0,
            minHeight: 0,
            display: "grid",
            gridTemplateRows: "minmax(0, 1fr) auto",
          }}
        >
          <Box sx={{ minHeight: 0, p: { xs: 1.5, md: 2.25 } }}>
            <Paper
              elevation={0}
              sx={{
                height: "100%",
                minHeight: 420,
                p: { xs: 1.5, md: 2 },
                borderRadius: 4,
                border: "1px solid",
                borderColor: "divider",
                background:
                  "radial-gradient(circle at top, rgba(140, 193, 255, 0.08), transparent 30%), rgba(8, 10, 15, 0.82)",
              }}
            >
              <Stack spacing={2.5} sx={{ height: "100%" }}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  alignItems={{ xs: "flex-start", md: "center" }}
                  justifyContent="space-between"
                  spacing={1.5}
                >
                  <Stack spacing={0.5}>
                    <Typography variant="h6">{controller.currentFrame?.title ?? "No frame selected"}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {controller.currentFrame?.caption || dataset.group.description}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {dataset.group.tags.map((tag) => (
                      <Chip key={tag} label={tag} size="small" variant="outlined" />
                    ))}
                    <Chip
                      size="small"
                      icon={<Layers fontSize="small" />}
                      label={`${controller.frames.length} frames`}
                      variant="outlined"
                    />
                  </Stack>
                </Stack>

                {controller.mode === "heatmap" && !controller.heatmapAsset ? <HeatmapNotice /> : null}

                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ViewerStage
                    beforeAsset={controller.beforeAsset}
                    afterAsset={controller.afterAsset}
                    heatmapAsset={controller.heatmapAsset}
                    mode={controller.mode}
                    abSide={controller.abSide}
                    overlayOpacity={controller.overlayOpacity}
                    onAbSideChange={controller.setAbSide}
                  />
                </Box>

                {controller.mode === "heatmap" && controller.heatmapAsset ? (
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Tune fontSize="small" />
                      <Typography variant="body2">Overlay opacity</Typography>
                    </Stack>
                    <Slider
                      min={20}
                      max={95}
                      value={controller.overlayOpacity}
                      onChange={(_, value) =>
                        controller.setOverlayOpacity(
                          clampNumber(Array.isArray(value) ? value[0] : value, 20, 95),
                        )
                      }
                      valueLabelDisplay="auto"
                      sx={{ maxWidth: 320 }}
                    />
                  </Stack>
                ) : null}
              </Stack>
            </Paper>
          </Box>

          <Box
            sx={{
              px: { xs: 1.5, md: 2.25 },
              pb: { xs: 1.5, md: 2.25 },
              borderTop: "1px solid",
              borderColor: "divider",
              backgroundColor: "rgba(255,255,255,0.015)",
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" py={1.25}>
              <Stack spacing={0.25}>
                <Typography variant="body2" fontWeight={600}>
                  Filmstrip
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Arrow keys navigate. Drag thumbnails in internal mode.
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.5}>
                <IconButton onClick={() => controller.stepFrame(-1)} size="small">
                  <KeyboardArrowLeft />
                </IconButton>
                <IconButton onClick={() => controller.stepFrame(1)} size="small">
                  <KeyboardArrowRight />
                </IconButton>
              </Stack>
            </Stack>
            <Box sx={{ overflow: "hidden" }} ref={emblaRef}>
              {variant === "internal" && onFrameReorder ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => {
                    const activeId = String(event.active.id);
                    const overId = event.over ? String(event.over.id) : null;

                    if (!overId || activeId === overId) {
                      return;
                    }

                    const oldIndex = frames.findIndex((frame) => frame.id === activeId);
                    const newIndex = frames.findIndex((frame) => frame.id === overId);

                    if (oldIndex === -1 || newIndex === -1) {
                      return;
                    }

                    const reordered = arrayMove(frames, oldIndex, newIndex).map((frame, index) => ({
                      ...frame,
                      order: index,
                    }));
                    const reorderedIds = reordered.map((frame) => frame.id);

                    setFrames(reordered);
                    startSavingOrder(() => {
                      void onFrameReorder(reorderedIds);
                    });
                  }}
                >
                  <SortableContext items={frameIds} strategy={horizontalListSortingStrategy}>
                    <Stack direction="row" spacing={1.25}>
                      {controller.frames.map((frame) => (
                        <SortableThumbnailItem
                          key={frame.id}
                          frame={frame}
                          isActive={frame.id === controller.currentFrame?.id}
                          onClick={() => controller.selectFrame(frame.id)}
                        />
                      ))}
                    </Stack>
                  </SortableContext>
                </DndContext>
              ) : (
                <Stack direction="row" spacing={1.25}>
                  {controller.frames.map((frame) => (
                    <ThumbnailButton
                      key={frame.id}
                      frame={frame}
                      isActive={frame.id === controller.currentFrame?.id}
                      onClick={() => controller.selectFrame(frame.id)}
                    />
                  ))}
                </Stack>
              )}
            </Box>
            {isSavingOrder ? (
              <Typography variant="caption" color="primary.main" sx={{ display: "block", mt: 1 }}>
                Saving frame order...
              </Typography>
            ) : null}
          </Box>
        </Box>

        <AnimatePresence initial={false}>
          {controller.sidebarOpen ? (
            <Box
              component={motion.aside}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              sx={{
                display: { xs: "none", lg: "block" },
                borderLeft: "1px solid",
                borderColor: "divider",
                backgroundColor: "rgba(255,255,255,0.02)",
              }}
            >
              <Stack spacing={2} sx={{ p: 2.25 }}>
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    Group navigator
                  </Typography>
                  <GroupLinks currentGroup={group} groups={dataset.siblingGroups} />
                </Stack>
                <Divider />
                <Stack spacing={0.75}>
                  <Typography variant="body2" color="text.secondary">
                    Frame details
                  </Typography>
                  <Typography variant="subtitle1">{controller.currentFrame?.title}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {controller.currentFrame?.caption || "No frame note."}
                  </Typography>
                </Stack>
                <Divider />
                <Stack spacing={0.75}>
                  <Typography variant="body2" color="text.secondary">
                    Asset metadata
                  </Typography>
                  <Typography variant="body2">
                    Primary assets:{" "}
                    {(controller.currentFrame?.assets ?? [])
                      .filter((asset) => asset.isPrimaryDisplay)
                      .map((asset) => asset.label)
                      .join(", ") || "None"}
                  </Typography>
                  <Typography variant="body2">
                    Heatmap: {controller.heatmapAsset ? "Available" : "Unavailable"}
                  </Typography>
                </Stack>
                {variant === "internal" && dataset.publishStatus ? (
                  <>
                    <Divider />
                    <Stack spacing={0.75}>
                      <Typography variant="body2" color="text.secondary">
                        Publish status
                      </Typography>
                      <Chip
                        label={dataset.publishStatus.status}
                        color={dataset.publishStatus.status === "published" ? "primary" : "default"}
                        size="small"
                        sx={{ alignSelf: "flex-start" }}
                      />
                      <Typography variant="body2">
                        Public slug: {dataset.publishStatus.publicSlug ?? "Pending first publish"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatUtcDate(dataset.publishStatus.publishedAt ?? null)}
                      </Typography>
                    </Stack>
                  </>
                ) : null}
              </Stack>
            </Box>
          ) : null}
        </AnimatePresence>
      </Paper>
    </Box>
  );
}
