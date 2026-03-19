"use client";

import {
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
  Drawer,
  FormControl,
  IconButton,
  Link as MuiLink,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
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
import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
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
        minWidth: 168,
        maxWidth: 168,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 0.9,
        borderRadius: 2.25,
        border: "1px solid",
        borderColor: isActive ? "primary.main" : "divider",
        backgroundColor: isActive ? "rgba(200, 161, 111, 0.08)" : "rgba(255, 255, 255, 0.015)",
        boxShadow: isActive ? "inset 0 0 0 1px rgba(200, 161, 111, 0.18)" : "none",
        p: 1.1,
      }}
    >
      <Box
        sx={{
          borderRadius: 2,
          overflow: "hidden",
          backgroundColor: "rgba(255,255,255,0.035)",
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
      <Stack spacing={0.1} alignItems="center">
        <Typography
          variant="body2"
          fontWeight={600}
          noWrap
          sx={{ width: "100%", textAlign: "center" }}
        >
          {frame.title}
        </Typography>
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
        width: "100%",
        height: "100%",
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}

function StagePresentationShell({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100%",
        aspectRatio: "16 / 9",
        minHeight: { xs: 220, md: 340 },
        borderRadius: 2.5,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        background:
          "radial-gradient(circle at top, rgba(200, 161, 111, 0.07), transparent 28%), rgba(12, 14, 17, 0.96)",
      }}
    >
      {children}
    </Box>
  );
}

function HeatmapNotice() {
  return (
    <Alert
      severity="info"
      sx={{
        borderRadius: 2.5,
        bgcolor: "rgba(200, 161, 111, 0.12)",
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
}: {
  beforeAsset: ViewerAsset | undefined;
  afterAsset: ViewerAsset | undefined;
  heatmapAsset: ViewerAsset | undefined;
  mode: ViewerMode;
  abSide: "before" | "after";
  overlayOpacity: number;
}) {
  if (!beforeAsset || !afterAsset) {
    return (
      <StagePresentationShell>
        <Stack spacing={1.5} alignItems="center">
          <PhotoLibrary sx={{ color: "text.secondary" }} />
          <Typography variant="body1">This frame is missing its before/after pair.</Typography>
        </Stack>
      </StagePresentationShell>
    );
  }

  if (mode === "a-b") {
    const visibleAsset = abSide === "before" ? beforeAsset : afterAsset;
    return (
      <StagePresentationShell>
        <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
          <StageImage asset={visibleAsset} alt={`${visibleAsset.label} preview`} />
        </Box>
      </StagePresentationShell>
    );
  }

  if (mode === "heatmap" && heatmapAsset) {
    return (
      <StagePresentationShell>
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
      </StagePresentationShell>
    );
  }

  return (
    <StagePresentationShell>
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
    </StagePresentationShell>
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

function ViewerSidebarContent({
  currentGroup,
  currentFrame,
  groups,
  heatmapAsset,
  publishStatus,
  variant,
}: {
  currentGroup: ViewerGroup;
  currentFrame: ViewerFrame | undefined;
  groups: ViewerDataset["siblingGroups"];
  heatmapAsset: ViewerAsset | undefined;
  publishStatus: ViewerDataset["publishStatus"];
  variant: "public" | "internal";
}) {
  return (
    <Stack spacing={2} sx={{ p: 2.25 }}>
      <Stack spacing={0.5}>
        <Typography variant="body2" color="text.secondary">
          Group navigator
        </Typography>
        <GroupLinks currentGroup={currentGroup} groups={groups} />
      </Stack>
      <Divider />
      <Stack spacing={0.75}>
        <Typography variant="body2" color="text.secondary">
          Frame details
        </Typography>
        <Typography variant="subtitle1">{currentFrame?.title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {currentFrame?.caption || "No frame note."}
        </Typography>
      </Stack>
      <Divider />
      <Stack spacing={0.75}>
        <Typography variant="body2" color="text.secondary">
          Asset metadata
        </Typography>
        <Typography variant="body2">
          Primary assets:{" "}
          {(currentFrame?.assets ?? [])
            .filter((asset) => asset.isPrimaryDisplay)
            .map((asset) => asset.label)
            .join(", ") || "None"}
        </Typography>
        <Typography variant="body2">
          Heatmap: {heatmapAsset ? "Available" : "Unavailable"}
        </Typography>
      </Stack>
      {variant === "internal" && publishStatus ? (
        <>
          <Divider />
          <Stack spacing={0.75}>
            <Typography variant="body2" color="text.secondary">
              Publish status
            </Typography>
            <Chip
              label={publishStatus.status}
              color={publishStatus.status === "published" ? "primary" : "default"}
              size="small"
              sx={{ alignSelf: "flex-start" }}
            />
            <Typography variant="body2">
              Public slug: {publishStatus.publicSlug ?? "Pending first publish"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatUtcDate(publishStatus.publishedAt ?? null)}
            </Typography>
          </Stack>
        </>
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
  const theme = useTheme();
  const showDesktopSidebar = useMediaQuery(theme.breakpoints.up("lg"), { noSsr: true });

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

      if ((event.key === "ArrowUp" || event.key === "ArrowDown") && controller.mode === "a-b") {
        event.preventDefault();
        controller.setAbSide(controller.abSide === "before" ? "after" : "before");
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

  return (
    <Box
      sx={{
        minHeight: "100svh",
        px: { xs: 1.25, md: 2.5 },
        py: { xs: 1.25, md: 2.25 },
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 22%), transparent",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          display: "grid",
          gridTemplateColumns:
            controller.sidebarOpen && showDesktopSidebar ? "minmax(0, 1fr) 320px" : "1fr",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
          minHeight: "calc(100svh - 16px)",
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          backgroundColor: "rgba(19, 21, 24, 0.92)",
        }}
      >
        <Box
          sx={{
            gridColumn: "1 / -1",
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: { xs: "stretch", md: "center" },
            justifyContent: "space-between",
            gap: 1.5,
            p: { xs: 2.25, md: 3 },
            borderBottom: "1px solid",
            borderColor: "divider",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.028) 0%, rgba(255,255,255,0.012) 100%)",
          }}
        >
          <Stack spacing={0.2} sx={{ minWidth: 0, pr: { md: 2 } }}>
            <Typography variant="h4" noWrap>
              {dataset.group.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {dataset.caseMeta.title}
            </Typography>
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent={{ xs: "flex-start", md: "flex-end" }}
            flexWrap="wrap"
            useFlexGap
          >
            <ToggleButtonGroup
              exclusive
              size="small"
              value={controller.mode}
              sx={{
                overflow: "visible",
                alignItems: "stretch",
                "& .MuiToggleButtonGroup-grouped": {
                  height: 34,
                  minHeight: 34,
                  px: 1.3,
                  fontWeight: 400,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: "999px !important",
                  fontSize: "0.92rem",
                },
                "& .MuiToggleButtonGroup-grouped:not(:first-of-type)": {
                  marginLeft: "0 !important",
                  borderLeft: "1px solid",
                  borderLeftColor: "divider",
                },
                "& .MuiToggleButtonGroup-grouped.Mui-selected": {
                  borderColor: "rgba(200, 161, 111, 0.45)",
                },
                "& .MuiToggleButtonGroup-grouped.Mui-disabled": {
                  borderColor: "divider",
                },
              }}
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
            {controller.mode === "a-b" ? (
              <FormControl
                size="small"
                sx={{
                  minWidth: 104,
                  "& .MuiOutlinedInput-root": {
                    height: 34,
                    minHeight: 34,
                  },
                  "& .MuiSelect-select": {
                    display: "flex",
                    alignItems: "center",
                    minHeight: "34px !important",
                    py: "0 !important",
                    pl: 1.5,
                    pr: 3.75,
                    fontSize: "0.92rem",
                  },
                }}
              >
                <Select
                  value={controller.abSide}
                  onChange={(event) =>
                    controller.setAbSide(String(event.target.value) as "before" | "after")
                  }
                  inputProps={{ "aria-label": "Choose A/B side" }}
                >
                  <MenuItem value="before">Before</MenuItem>
                  <MenuItem value="after">After</MenuItem>
                </Select>
              </FormControl>
            ) : null}
            <Tooltip title={controller.sidebarOpen ? "Close details (I)" : "Open details (I)"}>
              <IconButton
                size="small"
                onClick={controller.toggleSidebar}
                sx={{
                  width: 34,
                  height: 34,
                  "& .MuiSvgIcon-root": {
                    fontSize: 18,
                  },
                }}
              >
                <ViewSidebar />
              </IconButton>
            </Tooltip>
            {/* Fullscreen stays hidden until the viewer has a more useful in-page browsing model. */}
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
            <Stack spacing={1.5} sx={{ height: "100%", minHeight: { xs: 340, md: 460 } }}>
              {/* Stage header stays hidden for now to keep the comparison surface as the focal point. */}
              {controller.mode === "heatmap" && !controller.heatmapAsset ? <HeatmapNotice /> : null}

              <Box sx={{ flex: 1, minHeight: 0 }}>
                <ViewerStage
                  beforeAsset={controller.beforeAsset}
                  afterAsset={controller.afterAsset}
                  heatmapAsset={controller.heatmapAsset}
                  mode={controller.mode}
                  abSide={controller.abSide}
                  overlayOpacity={controller.overlayOpacity}
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
          </Box>

          <Box
            sx={{
              p: { xs: 1.5, md: 2.25 },
              borderTop: "1px solid",
              borderColor: "divider",
              backgroundColor: "rgba(255,255,255,0.012)",
            }}
          >
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
          {controller.sidebarOpen && showDesktopSidebar ? (
            <Box
              component={motion.aside}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              sx={{
                borderLeft: "1px solid",
                borderColor: "divider",
                backgroundColor: "rgba(255,255,255,0.02)",
              }}
            >
              <ViewerSidebarContent
                currentGroup={group}
                currentFrame={controller.currentFrame}
                groups={dataset.siblingGroups}
                heatmapAsset={controller.heatmapAsset}
                publishStatus={dataset.publishStatus}
                variant={variant}
              />
            </Box>
          ) : null}
        </AnimatePresence>
        <Drawer
          anchor="right"
          open={controller.sidebarOpen && !showDesktopSidebar}
          onClose={controller.toggleSidebar}
          ModalProps={{ keepMounted: true }}
          PaperProps={{
            sx: {
              width: "min(88vw, 360px)",
              borderLeft: "1px solid",
              borderColor: "divider",
              backgroundColor: "rgba(24, 26, 29, 0.98)",
              backgroundImage: "none",
            },
          }}
        >
          <ViewerSidebarContent
            currentGroup={group}
            currentFrame={controller.currentFrame}
            groups={dataset.siblingGroups}
            heatmapAsset={controller.heatmapAsset}
            publishStatus={dataset.publishStatus}
            variant={variant}
          />
        </Drawer>
      </Paper>
    </Box>
  );
}
