"use client";

import { cycleAbSide } from "@magic-compare/compare-core";
import type { ViewerMode } from "@magic-compare/content-schema";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  readViewerDetailsCookie,
  readViewerModeCookie,
  writeViewerDetailsCookie,
  writeViewerModeCookie,
} from "./viewer-cookies";
import { getViewerDevicePixelRatio, getViewportSize } from "./viewer-stage";

/**
 * Delays media-query-driven layout changes until after hydration so the server-rendered viewer and
 * the first client paint agree on whether mobile-only controls should be hidden or rotated.
 */
export function useViewerMediaPreferences() {
  const theme = useTheme();
  const showDesktopSidebar = useMediaQuery(theme.breakpoints.up("lg"), {
    noSsr: true,
  });
  const hideStageScrollControl = useMediaQuery(theme.breakpoints.down("sm"), {
    noSsr: true,
  });
  const rotateStage = useMediaQuery(
    "(max-width: 760px) and (orientation: portrait)",
    {
      noSsr: true,
    },
  );
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
    { noSsr: true },
  );
  const [mediaPreferencesReady, setMediaPreferencesReady] = useState(false);

  useEffect(() => {
    setMediaPreferencesReady(true);
  }, []);

  return {
    resolvedHideStageScrollControl: mediaPreferencesReady
      ? hideStageScrollControl
      : false,
    resolvedPrefersReducedMotion: mediaPreferencesReady
      ? prefersReducedMotion
      : false,
    resolvedRotateStage: mediaPreferencesReady ? rotateStage : false,
    resolvedShowDesktopSidebar: mediaPreferencesReady
      ? showDesktopSidebar
      : false,
  };
}

/**
 * Loads persisted sidebar/mode cookies once and delays subsequent writes until after that first
 * read, so hydration never overwrites the user's last preference before it is restored.
 */
export function useViewerPreferencePersistence(params: {
  mode: ViewerMode;
  setMode: (mode: ViewerMode) => void;
  setSidebarOpen: (nextOpen: boolean) => void;
  sidebarOpen: boolean;
}) {
  const { mode, setMode, setSidebarOpen, sidebarOpen } = params;
  const sidebarPreferenceLoadedRef = useRef(false);
  const sidebarPreferencePersistReadyRef = useRef(false);
  const modePreferenceLoadedRef = useRef(false);
  const modePreferencePersistReadyRef = useRef(false);

  useEffect(() => {
    const preferredOpenState = readViewerDetailsCookie();
    const preferredMode = readViewerModeCookie();

    if (preferredOpenState !== null) {
      setSidebarOpen(preferredOpenState);
    }

    if (preferredMode) {
      setMode(preferredMode);
    }

    sidebarPreferenceLoadedRef.current = true;
    modePreferenceLoadedRef.current = true;
  }, [setMode, setSidebarOpen]);

  useEffect(() => {
    if (!sidebarPreferenceLoadedRef.current) {
      return;
    }

    if (!sidebarPreferencePersistReadyRef.current) {
      sidebarPreferencePersistReadyRef.current = true;
      return;
    }

    writeViewerDetailsCookie(sidebarOpen);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!modePreferenceLoadedRef.current) {
      return;
    }

    if (!modePreferencePersistReadyRef.current) {
      modePreferencePersistReadyRef.current = true;
      return;
    }

    writeViewerModeCookie(mode);
  }, [mode]);
}

/**
 * Fit calculations depend on live viewport geometry and device pixel ratio, not just CSS
 * breakpoints, so resize handling must refresh both values together.
 */
export function useViewerViewportMetrics(params: {
  setDevicePixelRatio: (nextValue: number) => void;
  setViewportSize: (nextValue: ReturnType<typeof getViewportSize>) => void;
}) {
  const { setDevicePixelRatio, setViewportSize } = params;
  useEffect(() => {
    function syncViewportMetrics() {
      setViewportSize(getViewportSize());
      setDevicePixelRatio(getViewerDevicePixelRatio());
    }

    syncViewportMetrics();
    window.addEventListener("resize", syncViewportMetrics);
    return () => window.removeEventListener("resize", syncViewportMetrics);
  }, [setDevicePixelRatio, setViewportSize]);
}

/**
 * Attaches keyboard shortcuts once while refs keep the latest mode and A/B state visible to the
 * handler, avoiding duplicate subscriptions during rapid viewer updates.
 */
export function useViewerKeyboardShortcuts(params: {
  abSide: "before" | "after";
  abStageActive: boolean;
  mode: ViewerMode;
  onResetView: () => void;
  setAbSide: (side: "before" | "after") => void;
  setAbStageActive: (nextActive: boolean) => void;
  setMode: (mode: ViewerMode) => void;
  stepFrame: (offset: number) => void;
  toggleSidebar: () => void;
}) {
  const {
    abSide,
    abStageActive,
    mode,
    onResetView,
    setAbSide,
    setAbStageActive,
    setMode,
    stepFrame,
    toggleSidebar,
  } = params;
  const abSideRef = useRef(abSide);
  const abStageActiveRef = useRef(abStageActive);
  const modeRef = useRef(mode);

  abSideRef.current = abSide;
  abStageActiveRef.current = abStageActive;
  modeRef.current = mode;

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          Boolean(event.target.closest('[contenteditable="true"]')) ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))
      ) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepFrame(1);
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepFrame(-1);
      }

      if (event.key === "1") {
        setMode("before-after");
      }

      if (event.key === "2") {
        setMode("a-b");
      }

      if (event.key === "3") {
        setMode("heatmap");
      }

      if (
        event.key === "Escape" &&
        modeRef.current === "a-b" &&
        abStageActiveRef.current
      ) {
        event.preventDefault();
        setAbStageActive(false);
      }

      if (
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        modeRef.current === "a-b" &&
        abStageActiveRef.current
      ) {
        event.preventDefault();
        setAbSide(cycleAbSide(abSideRef.current));
      }

      if (event.key.toLowerCase() === "i") {
        toggleSidebar();
      }

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        onResetView();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [
    onResetView,
    setAbSide,
    setAbStageActive,
    setMode,
    stepFrame,
    toggleSidebar,
  ]);
}

/**
 * A/B inspect mode exits only when the pointer lands outside the stage, which keeps taps inside
 * the canvas from collapsing inspect state on touch devices.
 */
export function useAbStageOutsideDismiss(params: {
  abStageActive: boolean;
  mode: ViewerMode;
  setAbStageActive: (nextActive: boolean) => void;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  const { abStageActive, mode, setAbStageActive, stageRef } = params;
  useEffect(() => {
    if (mode !== "a-b" || !abStageActive) {
      return;
    }

    function handleOutsidePointerDown(event: PointerEvent) {
      const stageNode = stageRef.current;

      if (
        !stageNode ||
        !(event.target instanceof Node) ||
        stageNode.contains(event.target)
      ) {
        return;
      }

      setAbStageActive(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () =>
      document.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
        true,
      );
  }, [abStageActive, mode, setAbStageActive, stageRef]);
}
