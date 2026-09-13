"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViewerMode } from "@magic-compare/content-schema";
import {
  getComparisonAssetKey,
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
  abSide: "before" | "after";
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  selectFrame: (frameId: string) => void;
  stepFrame: (delta: number) => void;
  setMode: (nextMode: ViewerMode) => void;
  setAbSide: (side: "before" | "after") => void;
  setComparisonAssetKey: (assetKey: string) => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  beforeAsset: ViewerAsset | undefined;
  afterAsset: ViewerAsset | undefined;
  comparisonAssetKey: string | undefined;
  comparisonAssets: ViewerAsset[];
  heatmapReferenceAsset: ViewerAsset | undefined;
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
  const [abSide, setAbSideState] = useState<"before" | "after">("after");
  const [comparisonAssetPreferenceKey, setComparisonAssetPreferenceKey] = useState<
    string | undefined
  >();
  const [sidebarOpen, setSidebarOpenState] = useState(false);

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
  const { afterAsset, beforeAsset, comparisonAssets, heatmapAsset, heatmapReferenceAsset } =
    useMemo(
      () => buildFrameAssets(currentFrame, comparisonAssetPreferenceKey),
      [comparisonAssetPreferenceKey, currentFrame],
    );
  const comparisonAssetKey = afterAsset ? getComparisonAssetKey(afterAsset) : undefined;
  const resolvedMode = resolveViewerMode(mode, currentFrame, group.defaultMode);
  const framesRef = useRef(frames);
  const currentFrameRef = useRef(currentFrame);
  const currentFrameIndexRef = useRef(currentFrameIndex);
  const defaultModeRef = useRef(group.defaultMode);

  // Event handlers need the latest frame and mode information without paying for new callback
  // identities every render, because the workbench now mounts long-lived DOM listeners around them.
  framesRef.current = frames;
  currentFrameRef.current = currentFrame;
  currentFrameIndexRef.current = currentFrameIndex;
  defaultModeRef.current = group.defaultMode;

  // The saved mode is advisory only; it must be revalidated whenever the active frame changes
  // because not every frame exposes heatmap or A/B assets.
  useEffect(() => {
    if (resolvedMode !== mode) {
      // Resolving before render prevents one invalid heatmap paint; this effect only repairs the
      // advisory stored value so later frames start from the same valid mode.
      setModeState(resolvedMode);
    }
  }, [mode, resolvedMode]);

  /**
   * Keeps frame selection callback identity stable so viewer effects can subscribe once and still
   * drive the latest selected frame.
   */
  const selectFrame = useCallback((frameId: string): void => {
    setCurrentFrameId(frameId);
  }, []);

  /**
   * Wraps frame stepping so keyboard navigation and UI controls both respect cyclic navigation
   * without rebuilding the callback on every render.
   */
  const stepFrame = useCallback((delta: number): void => {
    const currentFrames = framesRef.current;
    const currentIndex = currentFrameIndexRef.current;

    if (currentFrames.length === 0 || currentIndex === -1) {
      return;
    }

    const nextIndex = (currentIndex + delta + currentFrames.length) % currentFrames.length;
    setCurrentFrameId(currentFrames[nextIndex]?.id);
  }, []);

  /**
   * Resolves the requested mode through frame capabilities instead of trusting the caller, because
   * some modes disappear on a per-frame basis and mode buttons must not churn callback identity.
   */
  const setMode = useCallback((nextMode: ViewerMode): void => {
    setModeState(resolveViewerMode(nextMode, currentFrameRef.current, defaultModeRef.current));
  }, []);

  /**
   * Keeps A/B side changes stable for both toolbar controls and keyboard shortcuts.
   */
  const setAbSide = useCallback((side: "before" | "after"): void => {
    setAbSideState(side);
  }, []);

  /**
   * Stores the semantic column key rather than a frame-local asset id so Rip/Flt selection remains
   * stable while stepping through frames. Missing keys fall back when the next frame resolves.
   */
  const setComparisonAssetKey = useCallback((assetKey: string): void => {
    setComparisonAssetPreferenceKey(assetKey);
  }, []);

  /**
   * Allows callers to explicitly synchronize sidebar state from persisted preferences without
   * depending on the raw React state setter.
   */
  const setSidebarOpen = useCallback((open: boolean): void => {
    setSidebarOpenState(open);
  }, []);

  /**
   * Keeps the sidebar toggle local to the controller so both keyboard shortcuts and buttons mutate
   * the same state path without changing callback identity on every render.
   */
  const toggleSidebar = useCallback((): void => {
    setSidebarOpenState((previous) => !previous);
  }, []);

  /**
   * Gives drawers and dismissal paths an explicit close operation so "close" events cannot reopen
   * the sidebar by accidentally routing through toggle logic.
   */
  const closeSidebar = useCallback((): void => {
    setSidebarOpenState(false);
  }, []);

  return useMemo(
    () => ({
      frames,
      currentFrame,
      currentFrameIndex,
      mode: resolvedMode,
      availableModes,
      abSide,
      sidebarOpen,
      setSidebarOpen,
      selectFrame,
      stepFrame,
      setMode,
      setAbSide,
      setComparisonAssetKey,
      toggleSidebar,
      closeSidebar,
      beforeAsset,
      afterAsset,
      comparisonAssetKey,
      comparisonAssets,
      heatmapReferenceAsset,
      heatmapAsset,
    }),
    [
      abSide,
      afterAsset,
      availableModes,
      beforeAsset,
      closeSidebar,
      currentFrame,
      currentFrameIndex,
      comparisonAssetKey,
      comparisonAssets,
      frames,
      heatmapAsset,
      heatmapReferenceAsset,
      resolvedMode,
      selectFrame,
      setAbSide,
      setComparisonAssetKey,
      setMode,
      setSidebarOpen,
      sidebarOpen,
      stepFrame,
      toggleSidebar,
    ],
  );
}
