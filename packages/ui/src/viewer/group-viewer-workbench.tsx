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
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ViewerMode } from "@magic-compare/content-schema";
import {
  clampViewerPanZoom,
  cycleAbSide,
  getContainedMediaRect,
  getFilmstripScrollbarMetrics,
  getFittedStageSize as getViewerFittedStageSize,
  type ViewerMediaRect,
  type ViewerPanZoomState,
} from "@magic-compare/compare-core";
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

interface PointerSample {
  x: number;
  y: number;
}

interface FilmstripScrollState {
  clientWidth: number;
  scrollLeft: number;
  scrollWidth: number;
}

const DEFAULT_PAN_ZOOM: ViewerPanZoomState = {
  scale: 1,
  x: 0,
  y: 0,
};

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

function useElementSize(targetRef: RefObject<HTMLElement | null>): StageSize {
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });

  useEffect(() => {
    const target = targetRef.current;

    if (!target) {
      return;
    }

    function syncSize() {
      const element = targetRef.current;

      if (!element) {
        return;
      }

      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    }

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef]);

  return size;
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
        backgroundColor: isActive ? "rgba(232, 198, 246, 0.1)" : "rgba(255, 255, 255, 0.018)",
        boxShadow: isActive ? "inset 0 0 0 1px rgba(232, 198, 246, 0.18)" : "none",
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

function buildMediaTransform(
  rotateStage: boolean,
  panZoomState: ViewerPanZoomState,
): CSSProperties["transform"] {
  return [
    "translate(-50%, -50%)",
    rotateStage ? "rotate(90deg)" : "",
    `translate3d(${panZoomState.x}px, ${panZoomState.y}px, 0)`,
    `scale(${panZoomState.scale})`,
  ]
    .filter(Boolean)
    .join(" ");
}

function PositionedStageMedia({
  asset,
  alt,
  mediaRect,
  rotateStage,
  panZoomState = DEFAULT_PAN_ZOOM,
  opacity = 1,
  clipPath,
}: {
  asset: ViewerAsset;
  alt: string;
  mediaRect: ViewerMediaRect;
  rotateStage: boolean;
  panZoomState?: ViewerPanZoomState;
  opacity?: number;
  clipPath?: string;
}) {
  if (mediaRect.width <= 0 || mediaRect.height <= 0) {
    return null;
  }

  const mediaWidth = rotateStage ? mediaRect.height : mediaRect.width;
  const mediaHeight = rotateStage ? mediaRect.width : mediaRect.height;

  return (
    <Box
      sx={{
        position: "absolute",
        left: `${mediaRect.x}px`,
        top: `${mediaRect.y}px`,
        width: `${mediaRect.width}px`,
        height: `${mediaRect.height}px`,
        overflow: "hidden",
        clipPath,
        pointerEvents: "none",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: `${mediaWidth}px`,
          height: `${mediaHeight}px`,
          transform: buildMediaTransform(rotateStage, panZoomState),
          transformOrigin: "center center",
          transition:
            "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        }}
      >
        <Box
          component="img"
          src={asset.imageUrl}
          alt={alt}
          draggable={false}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "fill",
            display: "block",
            opacity,
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserDrag: "none",
          }}
        />
      </Box>
    </Box>
  );
}

function getPointerDistance(first: PointerSample, second: PointerSample): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function SwipeCompareStage({
  beforeAsset,
  afterAsset,
  mediaRect,
  rotateStage,
  swipePosition,
  setSwipePosition,
}: {
  beforeAsset: ViewerAsset;
  afterAsset: ViewerAsset;
  mediaRect: ViewerMediaRect;
  rotateStage: boolean;
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

    if (mediaRect.width <= 0) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const localX = clientX - rect.left - mediaRect.x;
    setSwipePosition(clampNumber((localX / mediaRect.width) * 100, 0, 100));
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
      <PositionedStageMedia
        asset={beforeAsset}
        alt={`${beforeAsset.label} preview`}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
      />
      <PositionedStageMedia
        asset={afterAsset}
        alt={`${afterAsset.label} preview`}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
        clipPath={`inset(0 ${100 - swipePosition}% 0 0)`}
      />
      <Box
        sx={{
          position: "absolute",
          top: `${mediaRect.y}px`,
          height: `${mediaRect.height}px`,
          left: `${mediaRect.x + (mediaRect.width * swipePosition) / 100}px`,
          width: 2,
          transform: "translateX(-1px)",
          backgroundColor: "rgba(248, 245, 255, 0.88)",
          boxShadow:
            "0 0 14px rgba(228, 194, 242, 0.24), 0 0 36px rgba(242, 235, 201, 0.12)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          left: `${mediaRect.x + (mediaRect.width * swipePosition) / 100}px`,
          top: `${mediaRect.y + mediaRect.height / 2}px`,
          transform: "translate(-50%, -50%)",
          width: 42,
          height: 42,
          borderRadius: "999px",
          border: "1px solid rgba(248, 245, 255, 0.22)",
          backgroundColor: "rgba(22, 37, 76, 0.34)",
          backdropFilter: "blur(10px)",
          boxShadow:
            "0 10px 24px rgba(10, 18, 42, 0.18), 0 0 18px rgba(228, 194, 242, 0.18)",
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
          "&::before, &::after": {
            content: '""',
            position: "absolute",
            top: "50%",
            width: 8,
            height: 8,
            borderTop: "2px solid rgba(248, 245, 255, 0.72)",
            borderRight: "2px solid rgba(248, 245, 255, 0.72)",
            filter: "drop-shadow(0 0 5px rgba(10, 18, 42, 0.2))",
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
      />
    </Box>
  );
}

function ABCompareStage({
  activeAsset,
  mediaRect,
  rotateStage,
  panZoomState,
  setPanZoomState,
  onCycleSide,
}: {
  activeAsset: ViewerAsset;
  mediaRect: ViewerMediaRect;
  rotateStage: boolean;
  panZoomState: ViewerPanZoomState;
  setPanZoomState: (nextState: ViewerPanZoomState) => void;
  onCycleSide: () => void;
}) {
  const activePointersRef = useRef<Map<number, PointerSample>>(new Map());
  const panGestureRef = useRef<{
    baseState: ViewerPanZoomState;
    moved: boolean;
    pointerId: number;
    start: PointerSample;
  } | null>(null);
  const pinchGestureRef = useRef<{
    distance: number;
    startScale: number;
  } | null>(null);
  const panZoomStateRef = useRef(panZoomState);

  useEffect(() => {
    panZoomStateRef.current = panZoomState;
  }, [panZoomState]);

  function applyPanZoom(nextState: ViewerPanZoomState) {
    setPanZoomState(clampViewerPanZoom(nextState, mediaRect));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (activePointersRef.current.size === 1) {
      panGestureRef.current = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        moved: false,
        baseState: panZoomStateRef.current,
      };
      pinchGestureRef.current = null;
      return;
    }

    const points = [...activePointersRef.current.values()];

    if (points.length === 2) {
      pinchGestureRef.current = {
        distance: getPointerDistance(points[0], points[1]),
        startScale: panZoomStateRef.current.scale,
      };
      panGestureRef.current = null;
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activePointersRef.current.has(event.pointerId)) {
      return;
    }

    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const points = [...activePointersRef.current.values()];

    if (points.length === 2 && pinchGestureRef.current) {
      const distance = getPointerDistance(points[0], points[1]);
      const nextScale = clampNumber(
        pinchGestureRef.current.startScale * (distance / pinchGestureRef.current.distance),
        1,
        5,
      );

      applyPanZoom({
        scale: nextScale,
        x: panZoomStateRef.current.x,
        y: panZoomStateRef.current.y,
      });
      return;
    }

    const panGesture = panGestureRef.current;

    if (!panGesture || panGesture.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - panGesture.start.x;
    const deltaY = event.clientY - panGesture.start.y;

    if (Math.abs(deltaX) + Math.abs(deltaY) > 6) {
      panGesture.moved = true;
    }

    if (panGesture.baseState.scale > 1) {
      applyPanZoom({
        scale: panGesture.baseState.scale,
        x: panGesture.baseState.x + deltaX,
        y: panGesture.baseState.y + deltaY,
      });
    }
  }

  function finishPointerInteraction(event: ReactPointerEvent<HTMLDivElement>) {
    activePointersRef.current.delete(event.pointerId);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (activePointersRef.current.size >= 2) {
      const points = [...activePointersRef.current.values()];
      pinchGestureRef.current = {
        distance: getPointerDistance(points[0], points[1]),
        startScale: panZoomStateRef.current.scale,
      };
      return;
    }

    if (activePointersRef.current.size === 0) {
      const panGesture = panGestureRef.current;

      if (panGesture?.pointerId === event.pointerId && !panGesture.moved) {
        onCycleSide();
      }

      panGestureRef.current = null;
      pinchGestureRef.current = null;
      return;
    }

    const [remainingPointerId, remainingPoint] = [...activePointersRef.current.entries()][0];
    panGestureRef.current = {
      pointerId: remainingPointerId,
      start: remainingPoint,
      moved: false,
      baseState: panZoomStateRef.current,
    };
    pinchGestureRef.current = null;
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();
    const nextScale = panZoomStateRef.current.scale * (event.deltaY < 0 ? 1.12 : 0.88);

    applyPanZoom({
      scale: nextScale,
      x: panZoomStateRef.current.x,
      y: panZoomStateRef.current.y,
    });
  }

  return (
    <Box
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerInteraction}
      onPointerCancel={finishPointerInteraction}
      onWheel={handleWheel}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        touchAction: "none",
        cursor: panZoomState.scale > 1 ? "grab" : "pointer",
        userSelect: "none",
      }}
    >
      <PositionedStageMedia
        asset={activeAsset}
        alt={`${activeAsset.label} preview`}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
        panZoomState={panZoomState}
      />
    </Box>
  );
}

function StagePresentationShell({
  children,
  fittedSize,
  rotateStage,
}: {
  children: ReactNode;
  fittedSize: StageSize | null;
  rotateStage: boolean;
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
        aspectRatio: rotateStage ? "9 / 16" : "16 / 9",
        minHeight: fitActive ? 0 : rotateStage ? { xs: 420, md: 520 } : { xs: 220, md: 340 },
        maxHeight: fittedSize ? `${fittedSize.height}px` : "none",
        marginInline: "auto",
        borderRadius: 2.5,
        overflow: "hidden",
        border: "1px solid",
        borderColor: fitActive ? "rgba(232, 198, 246, 0.36)" : "divider",
        background:
          "radial-gradient(circle at top, rgba(232, 198, 246, 0.1), transparent 28%), rgba(13, 24, 54, 0.94)",
        boxShadow: fitActive ? "0 24px 52px rgba(8, 15, 35, 0.28)" : "none",
        transition:
          "max-width 180ms cubic-bezier(0.22, 1, 0.36, 1), max-height 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms cubic-bezier(0.22, 1, 0.36, 1)",
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
        bgcolor: "rgba(232, 198, 246, 0.12)",
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
  rotateStage,
  panZoomState,
  setPanZoomState,
  onCycleAbSide,
  swipePosition,
  setSwipePosition,
}: {
  beforeAsset: ViewerAsset | undefined;
  afterAsset: ViewerAsset | undefined;
  heatmapAsset: ViewerAsset | undefined;
  mode: ViewerMode;
  abSide: "before" | "after";
  overlayOpacity: number;
  rotateStage: boolean;
  panZoomState: ViewerPanZoomState;
  setPanZoomState: (nextState: ViewerPanZoomState) => void;
  onCycleAbSide: () => void;
  swipePosition: number;
  setSwipePosition: (value: number) => void;
}) {
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const viewportSize = useElementSize(stageViewportRef);
  const referenceAsset = afterAsset ?? beforeAsset;
  const mediaRect = useMemo(() => {
    if (!referenceAsset) {
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };
    }

    const mediaSize = rotateStage
      ? { width: referenceAsset.height, height: referenceAsset.width }
      : { width: referenceAsset.width, height: referenceAsset.height };

    return getContainedMediaRect(viewportSize, mediaSize);
  }, [referenceAsset, rotateStage, viewportSize]);

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
      <Box ref={stageViewportRef} sx={{ width: "100%", height: "100%" }}>
        <ABCompareStage
          activeAsset={visibleAsset}
          mediaRect={mediaRect}
          rotateStage={rotateStage}
          panZoomState={panZoomState}
          setPanZoomState={setPanZoomState}
          onCycleSide={onCycleAbSide}
        />
      </Box>
    );
  }

  if (mode === "heatmap" && heatmapAsset) {
    return (
      <Box ref={stageViewportRef} sx={{ width: "100%", height: "100%", position: "relative" }}>
        <PositionedStageMedia
          asset={afterAsset}
          alt={`${afterAsset.label} base`}
          mediaRect={mediaRect}
          rotateStage={rotateStage}
        />
        <PositionedStageMedia
          asset={heatmapAsset}
          alt={heatmapAsset.label}
          mediaRect={mediaRect}
          rotateStage={rotateStage}
          opacity={overlayOpacity / 100}
        />
      </Box>
    );
  }

  return (
    <Box ref={stageViewportRef} sx={{ width: "100%", height: "100%" }}>
      <SwipeCompareStage
        beforeAsset={beforeAsset}
        afterAsset={afterAsset}
        mediaRect={mediaRect}
        rotateStage={rotateStage}
        swipePosition={swipePosition}
        setSwipePosition={setSwipePosition}
      />
    </Box>
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
  rotateStage,
  panZoomState,
  setPanZoomState,
  onCycleAbSide,
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
  rotateStage: boolean;
  panZoomState: ViewerPanZoomState;
  setPanZoomState: (nextState: ViewerPanZoomState) => void;
  onCycleAbSide: () => void;
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
    rotateStage,
    panZoomState,
    setPanZoomState,
    onCycleAbSide,
    swipePosition,
    setSwipePosition,
  } satisfies {
    beforeAsset: ViewerAsset | undefined;
    afterAsset: ViewerAsset | undefined;
    heatmapAsset: ViewerAsset | undefined;
    mode: ViewerMode;
    abSide: "before" | "after";
    overlayOpacity: number;
    rotateStage: boolean;
    panZoomState: ViewerPanZoomState;
    setPanZoomState: (nextState: ViewerPanZoomState) => void;
    onCycleAbSide: () => void;
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
      <StagePresentationShell fittedSize={fittedStageSize} rotateStage={rotateStage}>
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
  const hideFitControl = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });
  const rotateStage = useMediaQuery("(max-width: 760px) and (orientation: portrait)", {
    noSsr: true,
  });
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true });
  const [viewportSize, setViewportSize] = useState<ViewportSize>(() => getViewportSize());
  const [fitViewViewportSignature, setFitViewViewportSignature] = useState<string | null>(null);
  const [swipePosition, setSwipePosition] = useState(50);
  const [abPanZoomState, setAbPanZoomState] = useState<ViewerPanZoomState>(DEFAULT_PAN_ZOOM);
  const [filmstripScrollState, setFilmstripScrollState] = useState<FilmstripScrollState>({
    clientWidth: 0,
    scrollLeft: 0,
    scrollWidth: 0,
  });
  const [filmstripEdgeOffset, setFilmstripEdgeOffset] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const filmstripViewportRef = useRef<HTMLDivElement | null>(null);
  const filmstripFrameRefs = useRef(new Map<string, HTMLButtonElement>());
  const filmstripDragStateRef = useRef<{
    lastClientX: number;
    lastTimestamp: number;
    moved: boolean;
    originFrameId: string | null;
    pointerId: number;
    startScrollLeft: number;
    startX: number;
  } | null>(null);
  const filmstripInertiaFrameRef = useRef<number | null>(null);
  const filmstripVelocityRef = useRef(0);
  const suppressFilmstripClickRef = useRef(false);
  const stageAspectRatio = rotateStage ? 9 / 16 : 16 / 9;
  const fittedStageSize = useMemo(
    () =>
      fitViewViewportSignature ? getViewerFittedStageSize(viewportSize, stageAspectRatio) : null,
    [fitViewViewportSignature, stageAspectRatio, viewportSize],
  );
  const filmstripScrollbarMetrics = useMemo(
    () =>
      getFilmstripScrollbarMetrics(
        filmstripScrollState.clientWidth,
        filmstripScrollState.scrollWidth,
        filmstripScrollState.scrollLeft,
      ),
    [filmstripScrollState],
  );

  useEffect(() => {
    if (controller.currentFrame) {
      const activeThumbnail = filmstripFrameRefs.current.get(controller.currentFrame.id);

      activeThumbnail?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [controller.currentFrame, prefersReducedMotion]);

  useEffect(() => {
    if (!fittedStageSize) {
      return;
    }

    stageRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
  }, [fittedStageSize, prefersReducedMotion]);

  useEffect(() => {
    setSwipePosition(50);
    setAbPanZoomState(DEFAULT_PAN_ZOOM);
  }, [controller.currentFrame?.id]);

  useEffect(() => {
    if (controller.mode !== "a-b") {
      setAbPanZoomState(DEFAULT_PAN_ZOOM);
    }
  }, [controller.mode]);

  useEffect(() => {
    function syncViewportSize() {
      setViewportSize(getViewportSize());
    }

    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);
    return () => window.removeEventListener("resize", syncViewportSize);
  }, []);

  useEffect(() => {
    const viewport = filmstripViewportRef.current;

    if (!viewport) {
      return;
    }

    function syncFilmstripScrollState() {
      const element = filmstripViewportRef.current;

      if (!element) {
        return;
      }

      setFilmstripScrollState({
        clientWidth: element.clientWidth,
        scrollLeft: element.scrollLeft,
        scrollWidth: element.scrollWidth,
      });
    }

    syncFilmstripScrollState();
    viewport.addEventListener("scroll", syncFilmstripScrollState, { passive: true });
    const observer = new ResizeObserver(syncFilmstripScrollState);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", syncFilmstripScrollState);
      observer.disconnect();
    };
  }, [controller.frames.length]);

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
        controller.setAbSide(cycleAbSide(controller.abSide));
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

  function cancelFilmstripInertia() {
    if (filmstripInertiaFrameRef.current !== null) {
      window.cancelAnimationFrame(filmstripInertiaFrameRef.current);
      filmstripInertiaFrameRef.current = null;
    }

    filmstripVelocityRef.current = 0;
  }

  function handleFilmstripPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (controller.frames.length <= 1) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    cancelFilmstripInertia();
    filmstripDragStateRef.current = {
      lastClientX: event.clientX,
      lastTimestamp: performance.now(),
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
    const viewport = event.currentTarget;
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const nextScrollLeft = dragState.startScrollLeft - travelX;
    const now = performance.now();
    const deltaTime = Math.max(now - dragState.lastTimestamp, 1);
    const deltaScroll = dragState.lastClientX - event.clientX;

    if (!dragState.moved && Math.abs(travelX) > 4) {
      dragState.moved = true;
      suppressFilmstripClickRef.current = true;
    }

    if (nextScrollLeft < 0 || nextScrollLeft > maxScrollLeft) {
      const overscroll = nextScrollLeft < 0 ? nextScrollLeft : nextScrollLeft - maxScrollLeft;
      setFilmstripEdgeOffset(clampNumber(-overscroll * 0.18, -18, 18));
      viewport.scrollLeft = clampNumber(nextScrollLeft, 0, maxScrollLeft);
    } else {
      setFilmstripEdgeOffset(0);
      viewport.scrollLeft = nextScrollLeft;
    }

    filmstripVelocityRef.current = deltaScroll / deltaTime;
    dragState.lastClientX = event.clientX;
    dragState.lastTimestamp = now;
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
    setFilmstripEdgeOffset(0);

    if (dragState.moved) {
      if (!prefersReducedMotion) {
        const viewport = event.currentTarget;
        const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);

        const step = () => {
          const nextScrollLeft = clampNumber(
            viewport.scrollLeft + filmstripVelocityRef.current * 16,
            0,
            maxScrollLeft,
          );

          viewport.scrollLeft = nextScrollLeft;
          filmstripVelocityRef.current *= 0.92;

          if (Math.abs(filmstripVelocityRef.current) < 0.02) {
            filmstripVelocityRef.current = 0;
            filmstripInertiaFrameRef.current = null;
            return;
          }

          filmstripInertiaFrameRef.current = window.requestAnimationFrame(step);
        };

        filmstripInertiaFrameRef.current = window.requestAnimationFrame(step);
      }

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
          background:
            "linear-gradient(180deg, rgba(31, 51, 97, 0.94) 0%, rgba(12, 25, 56, 0.92) 100%)",
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
              "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.018) 100%)",
          }}
        >
          <Stack spacing={0.2} sx={{ minWidth: 0, pr: { md: 2 } }}>
            <Typography variant="h4" noWrap>
              {dataset.group.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: "0.25em" }}>
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
            {!hideFitControl ? (
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
                    borderColor: fittedStageSize ? "rgba(232, 198, 246, 0.4)" : "divider",
                    backgroundColor: fittedStageSize
                      ? "rgba(232, 198, 246, 0.12)"
                      : "rgba(255,255,255,0.035)",
                  }}
                >
                  <FitScreen fontSize="small" />
                </IconButton>
              </Tooltip>
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
            <Stack
              spacing={1.5}
              sx={{
                width: "100%",
                minWidth: 0,
                height: "100%",
                minHeight: rotateStage ? { xs: 520, md: 560 } : { xs: 340, md: 460 },
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
                  rotateStage={rotateStage}
                  panZoomState={abPanZoomState}
                  setPanZoomState={setAbPanZoomState}
                  onCycleAbSide={() => controller.setAbSide(cycleAbSide(controller.abSide))}
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
                    <Typography variant="body2">Opacity</Typography>
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
              pb: { xs: 1.25, md: 1.4 },
              borderTop: "1px solid",
              borderColor: "divider",
              backgroundColor: "rgba(255,255,255,0.014)",
              position: "relative",
            }}
          >
            <Box
              ref={filmstripViewportRef}
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
                scrollbarWidth: "none",
                touchAction: "pan-y",
                cursor: controller.frames.length > 1 ? "grab" : "default",
                "&:active": {
                  cursor: controller.frames.length > 1 ? "grabbing" : "default",
                },
                "&::-webkit-scrollbar": {
                  display: "none",
                },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  gap: 1.25,
                  width: "max-content",
                  minWidth: "100%",
                  pb: 0.1,
                  pr: 0.25,
                  transform: `translate3d(${filmstripEdgeOffset}px, 0, 0)`,
                  transition:
                    filmstripDragStateRef.current || prefersReducedMotion
                      ? "none"
                      : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
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
            {filmstripScrollbarMetrics.visible ? (
              <Box
                aria-hidden
                sx={{
                  position: "absolute",
                  left: { xs: 20, md: 28 },
                  right: { xs: 20, md: 28 },
                  bottom: { xs: 8, md: 10 },
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                  pointerEvents: "none",
                }}
              >
                <Box
                  sx={{
                    width: `${filmstripScrollbarMetrics.thumbWidth}px`,
                    height: "100%",
                    borderRadius: 999,
                    background:
                      "linear-gradient(90deg, rgba(232, 198, 246, 0.42) 0%, rgba(242, 235, 201, 0.5) 100%)",
                    transform: `translate3d(${filmstripScrollbarMetrics.thumbOffset}px, 0, 0)`,
                    transition:
                      filmstripDragStateRef.current || prefersReducedMotion
                        ? "none"
                        : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), width 180ms cubic-bezier(0.22, 1, 0.36, 1)",
                    boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
                  }}
                />
              </Box>
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
                backgroundColor: "rgba(255,255,255,0.03)",
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
              backgroundColor: "rgba(20, 33, 70, 0.98)",
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
