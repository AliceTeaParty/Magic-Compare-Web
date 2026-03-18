"use client";

import { useEffect, useMemo, useState } from "react";
import type { ViewerMode } from "@magic-compare/content-schema";
import { orderByNumericOrder } from "@magic-compare/shared-utils";
import {
  findAsset,
  getAvailableModes,
  type ViewerAsset,
  type ViewerFrame,
  type ViewerGroup,
  resolveViewerMode,
} from "../utils/viewer-data";

export interface ViewerController {
  frames: ViewerFrame[];
  currentFrame: ViewerFrame | undefined;
  currentFrameIndex: number;
  mode: ViewerMode;
  availableModes: ViewerMode[];
  overlayOpacity: number;
  abSide: "before" | "after";
  sidebarOpen: boolean;
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

export function useViewerController(group: ViewerGroup): ViewerController {
  const frames = useMemo(() => orderByNumericOrder(group.frames), [group.frames]);
  const [currentFrameId, setCurrentFrameId] = useState<string | undefined>(frames[0]?.id);
  const [mode, setModeState] = useState<ViewerMode>(group.defaultMode);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(58);
  const [abSide, setAbSide] = useState<"before" | "after">("after");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!currentFrameId || !frames.some((frame) => frame.id === currentFrameId)) {
      setCurrentFrameId(frames[0]?.id);
    }
  }, [currentFrameId, frames]);

  const currentFrame = frames.find((frame) => frame.id === currentFrameId) ?? frames[0];
  const currentFrameIndex = currentFrame
    ? frames.findIndex((frame) => frame.id === currentFrame.id)
    : -1;
  const availableModes: ViewerMode[] = currentFrame
    ? getAvailableModes(currentFrame)
    : ["before-after"];

  useEffect(() => {
    setModeState((previousMode) =>
      resolveViewerMode(previousMode, currentFrame, group.defaultMode),
    );
  }, [currentFrame, group.defaultMode]);

  function selectFrame(frameId: string): void {
    setCurrentFrameId(frameId);
  }

  function stepFrame(delta: number): void {
    if (frames.length === 0 || currentFrameIndex === -1) {
      return;
    }

    const nextIndex = (currentFrameIndex + delta + frames.length) % frames.length;
    setCurrentFrameId(frames[nextIndex]?.id);
  }

  function setMode(nextMode: ViewerMode): void {
    setModeState(resolveViewerMode(nextMode, currentFrame, group.defaultMode));
  }

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
    selectFrame,
    stepFrame,
    setMode,
    setOverlayOpacity,
    setAbSide,
    toggleSidebar,
    beforeAsset: currentFrame ? findAsset(currentFrame, "before") : undefined,
    afterAsset: currentFrame ? findAsset(currentFrame, "after") : undefined,
    heatmapAsset: currentFrame ? findAsset(currentFrame, "heatmap") : undefined,
  };
}
