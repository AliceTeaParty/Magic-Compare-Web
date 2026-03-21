"use client";

import { useEffect, useMemo, useState } from "react";
import type { ViewerMode } from "@magic-compare/content-schema";
import {
  type ViewerAsset,
  type ViewerFrame,
  type ViewerGroup,
  resolveViewerMode,
} from "../utils/viewer-data";
import {
  buildFrameAssets,
  buildFrameState,
  getOrderedFrames,
  resolveFrameId,
} from "./viewer-controller-helpers";

export interface ViewerController {
  frames: ViewerFrame[];
  currentFrame: ViewerFrame | undefined;
  currentFrameIndex: number;
  mode: ViewerMode;
  availableModes: ViewerMode[];
  overlayOpacity: number;
  abSide: "before" | "after";
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  selectFrame: (frameId: string) => void;
  stepFrame: (delta: number) => void;
  setMode: (nextMode: ViewerMode) => void;
  setOverlayOpacity: (value: number) => void;
  setAbSide: (side: "before" | "after") => void;
  toggleSidebar: () => void;
  beforeAsset: ViewerAsset | undefined;
  afterAsset: ViewerAsset | undefined;
  heatmapAsset: ViewerAsset | undefined;
}

/**
 * Owns the viewer's interaction state so the workbench can stay declarative and the fallback rules
 * for frame/mode selection remain consistent across internal and public viewers.
 */
export function useViewerController(group: ViewerGroup): ViewerController {
  const frames = useMemo(() => getOrderedFrames(group), [group]);
  const [currentFrameId, setCurrentFrameId] = useState<string | undefined>(frames[0]?.id);
  const [mode, setModeState] = useState<ViewerMode>(group.defaultMode);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(58);
  const [abSide, setAbSide] = useState<"before" | "after">("after");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Import/publish changes can remove frames out from under the viewer, so selection repair has to
  // happen here instead of assuming the saved id is always still valid.
  useEffect(() => {
    const nextFrameId = resolveFrameId(frames, currentFrameId);
    if (nextFrameId !== currentFrameId) {
      setCurrentFrameId(nextFrameId);
    }
  }, [currentFrameId, frames]);

  const { currentFrame, currentFrameIndex, availableModes } = useMemo(
    () => buildFrameState(frames, currentFrameId),
    [currentFrameId, frames],
  );
  const { afterAsset, beforeAsset, heatmapAsset } = useMemo(
    () => buildFrameAssets(currentFrame),
    [currentFrame],
  );

  // The saved mode is advisory only; it must be revalidated whenever the active frame changes
  // because not every frame exposes heatmap or A/B assets.
  useEffect(() => {
    setModeState((previousMode) =>
      resolveViewerMode(previousMode, currentFrame, group.defaultMode),
    );
  }, [currentFrame, group.defaultMode]);

  function selectFrame(frameId: string): void {
    setCurrentFrameId(frameId);
  }

  /**
   * Wraps frame stepping so keyboard navigation and UI controls both respect cyclic navigation.
   */
  function stepFrame(delta: number): void {
    if (frames.length === 0 || currentFrameIndex === -1) {
      return;
    }

    const nextIndex = (currentFrameIndex + delta + frames.length) % frames.length;
    setCurrentFrameId(frames[nextIndex]?.id);
  }

  /**
   * Resolves the requested mode through frame capabilities instead of trusting the caller, because
   * some modes disappear on a per-frame basis.
   */
  function setMode(nextMode: ViewerMode): void {
    setModeState(resolveViewerMode(nextMode, currentFrame, group.defaultMode));
  }

  /**
   * Keeps the sidebar toggle local to the controller so both keyboard shortcuts and buttons mutate
   * the same state path.
   */
  function toggleSidebar(): void {
    setSidebarOpen((previous) => !previous);
  }

  return {
    frames,
    currentFrame,
    currentFrameIndex,
    mode,
    availableModes,
    overlayOpacity,
    abSide,
    sidebarOpen,
    setSidebarOpen,
    selectFrame,
    stepFrame,
    setMode,
    setOverlayOpacity,
    setAbSide,
    toggleSidebar,
    beforeAsset,
    afterAsset,
    heatmapAsset,
  };
}
