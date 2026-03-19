"use client";

import {
  FitScreen,
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
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
}

interface ThumbnailButtonProps {
  frame: ViewerFrame;
  isActive: boolean;
  onClick: () => void;
  buttonRef?: (node: HTMLButtonElement | null) => void;
}

interface ViewportSize {
  width: number;
  height: number;
}

interface StageSize {
  width: number;
  height: number;
}

function getViewportSize(): ViewportSize {
  if (typeof window === "undefined") {
    return { width: 0, height: 0 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function getViewportSignature(viewportSize: ViewportSize): string {
  return `${viewportSize.width}x${viewportSize.height}`;
}

function getFittedStageSize(viewportSize: ViewportSize): StageSize | null {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return null;
  }

  const horizontalPadding = viewportSize.width < 760 ? 20 : 56;
  const verticalPadding = viewportSize.height < 760 ? 20 : 56;
  const maxWidth = Math.max(viewportSize.width - horizontalPadding * 2, 220);
  const maxHeight = Math.max(viewportSize.height - verticalPadding * 2, 140);
  const aspectRatio = 16 / 9;

  let width = Math.min(maxWidth, maxHeight * aspectRatio);
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  return {
    width,
    height,
  };
}

function resolveThumbnailAsset(frame: ViewerFrame): ViewerAsset | undefined {
  return (
    frame.assets.find((asset) => asset.kind === "after" && asset.isPrimaryDisplay) ??
    frame.assets.find((asset) => asset.kind === "before" && asset.isPrimaryDisplay) ??
    frame.assets[0]
  );
}

function ThumbnailButton({ frame, isActive, onClick, buttonRef }: ThumbnailButtonProps) {
  const thumbAsset = resolveThumbnailAsset(frame);

  return (
    <Button
      ref={buttonRef}
      data-frame-id={frame.id}
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
            draggable={false}
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              pointerEvents: "none",
              userSelect: "none",
              WebkitUserDrag: "none",
            }}
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

function StageImage({ asset, alt }: { asset: ViewerAsset; alt: string }) {
  return (
    <Box
      component="img"
      src={asset.imageUrl}
      alt={alt}
      draggable={false}
      sx={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        display: "block",
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserDrag: "none",
      }}
    />
  );
}

function StageAssetLayer({ asset, alt }: { asset: ViewerAsset; alt: string }) {
  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
      }}
    >
      <StageImage asset={asset} alt={alt} />
    </Box>
  );
}

function SwipeCompareStage({
  beforeAsset,
  afterAsset,
  swipePosition,
  setSwipePosition,
}: {
  beforeAsset: ViewerAsset;
  afterAsset: ViewerAsset;
  swipePosition: number;
  setSwipePosition: (value: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  function updateSwipePosition(clientX: number) {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();

    if (rect.width <= 0) {
      return;
    }

    setSwipePosition(clampNumber(((clientX - rect.left) / rect.width) * 100, 0, 100));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateSwipePosition(event.clientX);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    updateSwipePosition(event.clientX);
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activePointerIdRef.current = null;
  }

  return (
    <Box
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      onDragStart={(event) => event.preventDefault()}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        touchAction: "none",
        cursor: "ew-resize",
        userSelect: "none",
      }}
    >
      <StageAssetLayer asset={beforeAsset} alt={`${beforeAsset.label} preview`} />
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          clipPath: `inset(0 ${100 - swipePosition}% 0 0)`,
        }}
      >
        <StageAssetLayer asset={afterAsset} alt={`${afterAsset.label} preview`} />
      </Box>
      <Box
        sx={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `calc(${swipePosition}% - 1px)`,
          width: 2,
          backgroundColor: "rgba(246, 241, 232, 0.92)",
          boxShadow: "0 0 0 1px rgba(12, 14, 17, 0.7)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          left: `${swipePosition}%`,
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 42,
          height: 42,
          borderRadius: "999px",
          border: "1px solid",
          borderColor: "rgba(246, 241, 232, 0.52)",
          backgroundColor: "rgba(56, 60, 66, 0.26)",
          boxShadow: "0 10px 24px rgba(0, 0, 0, 0.16)",
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
          "&::before, &::after": {
            content: '""',
            position: "absolute",
            top: "50%",
            width: 9,
            height: 9,
            borderTop: "2px solid rgba(246, 241, 232, 0.72)",
            borderRight: "2px solid rgba(246, 241, 232, 0.72)",
          },
          "&::before": {
            left: 10,
            transform: "translateY(-50%) rotate(-135deg)",
          },
          "&::after": {
            right: 10,
            transform: "translateY(-50%) rotate(45deg)",
          },
        }}
      >
        <Box
          sx={{
            width: 3,
            height: 18,
            borderRadius: "999px",
            backgroundColor: "rgba(246, 241, 232, 0.58)",
          }}
        />
      </Box>
    </Box>
  );
}

function StagePresentationShell({
  children,
  fittedSize,
}: {
  children: ReactNode;
  fittedSize: StageSize | null;
}) {
  const fitActive = Boolean(fittedSize);

  return (
    <Box
      sx={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100%",
        maxWidth: fittedSize ? `${fittedSize.width}px` : "100%",
        minWidth: 0,
        aspectRatio: "16 / 9",
        minHeight: fitActive ? 0 : { xs: 220, md: 340 },
        maxHeight: fittedSize ? `${fittedSize.height}px` : "none",
        marginInline: "auto",
        borderRadius: 2.5,
        overflow: "hidden",
        border: "1px solid",
        borderColor: fitActive ? "rgba(200, 161, 111, 0.32)" : "divider",
        background:
          "radial-gradient(circle at top, rgba(200, 161, 111, 0.07), transparent 28%), rgba(12, 14, 17, 0.96)",
        boxShadow: fitActive ? "0 20px 48px rgba(0, 0, 0, 0.28)" : "none",
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

function ViewerStageContent({
  beforeAsset,
  afterAsset,
  heatmapAsset,
  mode,
  abSide,
  overlayOpacity,
  swipePosition,
  setSwipePosition,
}: {
  beforeAsset: ViewerAsset | undefined;
  afterAsset: ViewerAsset | undefined;
  heatmapAsset: ViewerAsset | undefined;
  mode: ViewerMode;
  abSide: "before" | "after";
  overlayOpacity: number;
  swipePosition: number;
  setSwipePosition: (value: number) => void;
}) {
  if (!beforeAsset || !afterAsset) {
    return (
      <Stack spacing={1.5} alignItems="center">
        <PhotoLibrary sx={{ color: "text.secondary" }} />
        <Typography variant="body1">This frame is missing its before/after pair.</Typography>
      </Stack>
    );
  }

  if (mode === "a-b") {
    const visibleAsset = abSide === "before" ? beforeAsset : afterAsset;
    return (
      <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
        <StageImage asset={visibleAsset} alt={`${visibleAsset.label} preview`} />
      </Box>
    );
  }

  if (mode === "heatmap" && heatmapAsset) {
    return (
      <>
        <StageImage asset={afterAsset} alt={`${afterAsset.label} base`} />
        <Box
          component="img"
          src={heatmapAsset.imageUrl}
          alt={heatmapAsset.label}
          draggable={false}
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            opacity: overlayOpacity / 100,
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserDrag: "none",
          }}
        />
      </>
    );
  }

  return (
    <SwipeCompareStage
      beforeAsset={beforeAsset}
      afterAsset={afterAsset}
      swipePosition={swipePosition}
      setSwipePosition={setSwipePosition}
    />
  );
}

function ViewerStage({
  beforeAsset,
  afterAsset,
  heatmapAsset,
  mode,
  abSide,
  overlayOpacity,
  fittedStageSize,
  stageRef,
  swipePosition,
  setSwipePosition,
}: {
  beforeAsset: ViewerAsset | undefined;
  afterAsset: ViewerAsset | undefined;
  heatmapAsset: ViewerAsset | undefined;
  mode: ViewerMode;
  abSide: "before" | "after";
  overlayOpacity: number;
  fittedStageSize: StageSize | null;
  stageRef: (node: HTMLDivElement | null) => void;
  swipePosition: number;
  setSwipePosition: (value: number) => void;
}) {
  const contentProps = {
    beforeAsset,
    afterAsset,
    heatmapAsset,
    mode,
    abSide,
    overlayOpacity,
    swipePosition,
    setSwipePosition,
  } satisfies {
    beforeAsset: ViewerAsset | undefined;
    afterAsset: ViewerAsset | undefined;
    heatmapAsset: ViewerAsset | undefined;
    mode: ViewerMode;
    abSide: "before" | "after";
    overlayOpacity: number;
    swipePosition: number;
    setSwipePosition: (value: number) => void;
  };

  return (
    <Box
      ref={stageRef}
      sx={{
        width: "100%",
        minWidth: 0,
        display: "grid",
        placeItems: "center",
      }}
    >
      <StagePresentationShell fittedSize={fittedStageSize}>
        <ViewerStageContent {...contentProps} />
      </StagePresentationShell>
    </Box>
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
}: GroupViewerWorkbenchProps) {
  const controller = useViewerController(dataset.group);
  const theme = useTheme();
  const showDesktopSidebar = useMediaQuery(theme.breakpoints.up("lg"), { noSsr: true });
  const [viewportSize, setViewportSize] = useState<ViewportSize>(() => getViewportSize());
  const [fitViewViewportSignature, setFitViewViewportSignature] = useState<string | null>(null);
  const [swipePosition, setSwipePosition] = useState(50);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const filmstripFrameRefs = useRef(new Map<string, HTMLButtonElement>());
  const filmstripDragStateRef = useRef<{
    moved: boolean;
    originFrameId: string | null;
    pointerId: number;
    startScrollLeft: number;
    startX: number;
  } | null>(null);
  const suppressFilmstripClickRef = useRef(false);
  const fittedStageSize = useMemo(
    () => (fitViewViewportSignature ? getFittedStageSize(viewportSize) : null),
    [fitViewViewportSignature, viewportSize],
  );

  useEffect(() => {
    if (controller.currentFrame) {
      const activeThumbnail = filmstripFrameRefs.current.get(controller.currentFrame.id);

      activeThumbnail?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [controller.currentFrame]);

  useEffect(() => {
    if (!fittedStageSize) {
      return;
    }

    stageRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }, [fittedStageSize]);

  useEffect(() => {
    setSwipePosition(50);
  }, [controller.currentFrame?.id]);

  useEffect(() => {
    function syncViewportSize() {
      setViewportSize(getViewportSize());
    }

    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);
    return () => window.removeEventListener("resize", syncViewportSize);
  }, []);

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

  function toggleFittedStageView() {
    const nextViewportSize = getViewportSize();
    const nextSignature = getViewportSignature(nextViewportSize);

    setViewportSize(nextViewportSize);
    setFitViewViewportSignature((previousSignature) =>
      previousSignature && previousSignature === nextSignature ? null : nextSignature,
    );
  }

  function setFilmstripFrameRef(frameId: string) {
    return (node: HTMLButtonElement | null) => {
      if (node) {
        filmstripFrameRefs.current.set(frameId, node);
        return;
      }

      filmstripFrameRefs.current.delete(frameId);
    };
  }

  function handleFilmstripPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (controller.frames.length <= 1) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    filmstripDragStateRef.current = {
      moved: false,
      originFrameId:
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-frame-id]")?.dataset.frameId ?? null
          : null,
      pointerId: event.pointerId,
      startScrollLeft: event.currentTarget.scrollLeft,
      startX: event.clientX,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleFilmstripPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = filmstripDragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const travelX = event.clientX - dragState.startX;

    if (!dragState.moved && Math.abs(travelX) > 4) {
      dragState.moved = true;
      suppressFilmstripClickRef.current = true;
    }

    event.currentTarget.scrollLeft = dragState.startScrollLeft - travelX;
  }

  function finishFilmstripPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = filmstripDragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    filmstripDragStateRef.current = null;

    if (dragState.moved) {
      window.setTimeout(() => {
        suppressFilmstripClickRef.current = false;
      }, 0);
      return;
    }

    suppressFilmstripClickRef.current = false;

    if (dragState.originFrameId) {
      controller.selectFrame(dragState.originFrameId);
    }
  }

  function handleThumbnailSelection(frameId: string) {
    if (suppressFilmstripClickRef.current) {
      return;
    }

    controller.selectFrame(frameId);
  }

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
          width: "100%",
          maxWidth: "100%",
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
            position: "relative",
            zIndex: 2,
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
              <ToggleButton value="before-after">Swipe</ToggleButton>
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
            <Tooltip
              title={
                fittedStageSize
                  ? "Restore compare scale"
                  : "Fit the compare stage to the current viewport"
              }
            >
              <IconButton
                size="small"
                onClick={toggleFittedStageView}
                sx={{
                  width: 34,
                  height: 34,
                  borderColor: fittedStageSize ? "rgba(200, 161, 111, 0.36)" : "divider",
                  backgroundColor: fittedStageSize
                    ? "rgba(200, 161, 111, 0.12)"
                    : "rgba(255,255,255,0.035)",
                }}
              >
                <FitScreen fontSize="small" />
              </IconButton>
            </Tooltip>
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
            <Stack
              spacing={1.5}
              sx={{
                width: "100%",
                minWidth: 0,
                height: "100%",
                minHeight: { xs: 340, md: 460 },
              }}
            >
              {/* Stage header stays hidden for now to keep the comparison surface as the focal point. */}
              {controller.mode === "heatmap" && !controller.heatmapAsset ? <HeatmapNotice /> : null}

              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: fittedStageSize ? `${fittedStageSize.height}px` : 0,
                }}
              >
                <ViewerStage
                  beforeAsset={controller.beforeAsset}
                  afterAsset={controller.afterAsset}
                  heatmapAsset={controller.heatmapAsset}
                  mode={controller.mode}
                  abSide={controller.abSide}
                  overlayOpacity={controller.overlayOpacity}
                  fittedStageSize={fittedStageSize}
                  stageRef={(node) => {
                    stageRef.current = node;
                  }}
                  swipePosition={swipePosition}
                  setSwipePosition={setSwipePosition}
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
              minWidth: 0,
              px: { xs: 1.5, md: 2.25 },
              pt: { xs: 1.35, md: 2 },
              pb: { xs: 0.75, md: 1 },
              borderTop: "1px solid",
              borderColor: "divider",
              backgroundColor: "rgba(255,255,255,0.012)",
            }}
          >
            <Box
              onPointerDown={handleFilmstripPointerDown}
              onPointerMove={handleFilmstripPointerMove}
              onPointerUp={finishFilmstripPointerDrag}
              onPointerCancel={finishFilmstripPointerDrag}
              onDragStart={(event) => event.preventDefault()}
              sx={{
                width: "100%",
                minWidth: 0,
                overflowX: "auto",
                overflowY: "hidden",
                overscrollBehaviorX: "contain",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "thin",
                touchAction: "pan-y",
                cursor: controller.frames.length > 1 ? "grab" : "default",
                pb: 0.35,
                "&:active": {
                  cursor: controller.frames.length > 1 ? "grabbing" : "default",
                },
                "&::-webkit-scrollbar": {
                  height: 8,
                },
                "&::-webkit-scrollbar-thumb": {
                  backgroundColor: "rgba(246, 241, 232, 0.16)",
                  borderRadius: "999px",
                },
                "&::-webkit-scrollbar-track": {
                  backgroundColor: "transparent",
                },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  gap: 1.25,
                  width: "max-content",
                  minWidth: "100%",
                  pr: 0.25,
                }}
              >
                {controller.frames.map((frame) => (
                  <ThumbnailButton
                    key={frame.id}
                    frame={frame}
                    isActive={frame.id === controller.currentFrame?.id}
                    onClick={() => handleThumbnailSelection(frame.id)}
                    buttonRef={setFilmstripFrameRef(frame.id)}
                  />
                ))}
              </Box>
            </Box>
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
                currentGroup={dataset.group}
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
            currentGroup={dataset.group}
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
