"use client";

import {
  getViewerDisplayedScale,
  normalizeViewerDisplayedScale,
  VIEWER_MAX_PRESET_SCALE,
  VIEWER_MIN_PRESET_SCALE,
  type ViewerPanZoomState,
} from "@magic-compare/compare-core";
import { clampNumber } from "@magic-compare/shared-utils";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import {
  AB_PIXEL_RENDERING_AUTO_SCALE,
  shouldAutoEnableAbPixelRendering,
} from "./ab-pixel-rendering";
import { DEFAULT_PAN_ZOOM } from "./positioned-stage-media";
import {
  readViewerPixelRenderingAutoDisabledCookie,
  writeViewerPixelRenderingAutoDisabledCookie,
} from "./viewer-cookies";

export interface ViewerAbInteractionSnapshot {
  displayedScale: number;
  panZoomState: ViewerPanZoomState;
  pixelRenderingEnabled: boolean;
  stageActive: boolean;
}

interface ViewerFrameInteractionSnapshot {
  frameId: string | undefined;
  panZoomState: ViewerPanZoomState;
  stageActive: boolean;
  swipePosition: number;
}

interface ViewerSamplingSnapshot {
  pixelRenderingAutoDisablePromptOpen: boolean;
  pixelRenderingEnabled: boolean;
}

type FrameScheduler = (callback: () => void) => number;
type FrameCanceler = (handle: number) => void;

const DEFAULT_SWIPE_POSITION = 50;

function createFrameSnapshot(frameId: string | undefined): ViewerFrameInteractionSnapshot {
  return {
    frameId,
    panZoomState: DEFAULT_PAN_ZOOM,
    stageActive: false,
    swipePosition: DEFAULT_SWIPE_POSITION,
  };
}

/**
 * Keeps rapidly changing inspection values outside the workbench root. Frame-local snapshots reset
 * before paint, while sampling preferences remain attached to the mounted viewer session.
 */
export class ViewerInteractionStore {
  private readonly listeners = new Set<() => void>();
  private readonly fallbackFrames = new Map<string | undefined, ViewerFrameInteractionSnapshot>();
  private frameSnapshot: ViewerFrameInteractionSnapshot;
  private samplingSnapshot: ViewerSamplingSnapshot = {
    pixelRenderingAutoDisablePromptOpen: false,
    pixelRenderingEnabled: false,
  };
  private overlayOpacity = 58;
  private pixelRenderingAutoEnableDisabled = true;
  private pixelRenderingAutoTriggerArmed = true;
  private pixelRenderingAutoPromptDismissed = false;
  private notificationFrame: number | null = null;
  private readonly scheduleFrame: FrameScheduler | undefined;
  private readonly cancelFrame: FrameCanceler | undefined;

  constructor(
    frameId: string | undefined,
    scheduler?: { schedule: FrameScheduler; cancel: FrameCanceler },
  ) {
    this.frameSnapshot = createFrameSnapshot(frameId);
    this.scheduleFrame =
      scheduler?.schedule ??
      (typeof window === "undefined"
        ? undefined
        : (callback) => window.requestAnimationFrame(callback));
    this.cancelFrame =
      scheduler?.cancel ??
      (typeof window === "undefined" ? undefined : (handle) => window.cancelAnimationFrame(handle));
    this.refreshAbSnapshot();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Coalesces pointer, wheel, and slider work while preserving immediate semantic state changes. */
  private emit(immediate = false) {
    if (immediate || !this.scheduleFrame) {
      if (this.notificationFrame !== null) {
        this.cancelFrame?.(this.notificationFrame);
        this.notificationFrame = null;
      }
      this.listeners.forEach((listener) => listener());
      return;
    }

    if (this.notificationFrame !== null) {
      return;
    }

    this.notificationFrame = this.scheduleFrame(() => {
      this.notificationFrame = null;
      this.listeners.forEach((listener) => listener());
    });
  }

  /** Returns a stable default for a frame that has not yet been activated by the layout effect. */
  private getFallbackFrame(frameId: string | undefined) {
    const existing = this.fallbackFrames.get(frameId);
    if (existing) {
      return existing;
    }

    const fallback = createFrameSnapshot(frameId);
    this.fallbackFrames.set(frameId, fallback);
    return fallback;
  }

  private getFrame(frameId: string | undefined) {
    return this.frameSnapshot.frameId === frameId
      ? this.frameSnapshot
      : this.getFallbackFrame(frameId);
  }

  private ensureFrame(frameId: string | undefined) {
    if (this.frameSnapshot.frameId !== frameId) {
      this.frameSnapshot = createFrameSnapshot(frameId);
    }
  }

  activateFrame(frameId: string | undefined) {
    if (this.frameSnapshot.frameId === frameId) {
      return;
    }

    this.frameSnapshot = createFrameSnapshot(frameId);
    this.refreshAbSnapshot();
    this.emit(true);
  }

  getAbSnapshot = (frameId: string | undefined): ViewerAbInteractionSnapshot => {
    const frame = this.getFrame(frameId);
    return this.frameSnapshot.frameId === frameId && this.cachedAbSnapshot
      ? this.cachedAbSnapshot
      : this.getFallbackAbSnapshot(frame);
  };

  private cachedAbSnapshot: ViewerAbInteractionSnapshot | null = null;
  private readonly fallbackAbSnapshots = new Map<string | undefined, ViewerAbInteractionSnapshot>();

  private getFallbackAbSnapshot(frame: ViewerFrameInteractionSnapshot) {
    const existing = this.fallbackAbSnapshots.get(frame.frameId);
    if (existing) {
      return existing;
    }

    const snapshot = this.buildAbSnapshot(frame);
    this.fallbackAbSnapshots.set(frame.frameId, snapshot);
    return snapshot;
  }

  private buildAbSnapshot(frame: ViewerFrameInteractionSnapshot): ViewerAbInteractionSnapshot {
    return {
      displayedScale: getViewerDisplayedScale(frame.panZoomState),
      panZoomState: frame.panZoomState,
      pixelRenderingEnabled: this.samplingSnapshot.pixelRenderingEnabled,
      stageActive: frame.stageActive,
    };
  }

  private refreshAbSnapshot() {
    this.cachedAbSnapshot = this.buildAbSnapshot(this.frameSnapshot);
  }

  getAbStageActive = (frameId: string | undefined) => this.getFrame(frameId).stageActive;

  getSwipePosition = (frameId: string | undefined) => this.getFrame(frameId).swipePosition;

  getOverlayOpacity = () => this.overlayOpacity;

  getPixelRenderingAutoDisablePromptOpen = () =>
    this.samplingSnapshot.pixelRenderingAutoDisablePromptOpen;

  /** Applies the automatic sampling threshold without changing scale or translation. */
  private updatePixelRenderingAutomation(displayedScale: number) {
    if (displayedScale < AB_PIXEL_RENDERING_AUTO_SCALE) {
      this.pixelRenderingAutoTriggerArmed = true;
      return;
    }

    if (
      !shouldAutoEnableAbPixelRendering({
        autoEnableDisabled: this.pixelRenderingAutoEnableDisabled,
        autoTriggerArmed: this.pixelRenderingAutoTriggerArmed,
        displayedScale,
        pixelRenderingEnabled: this.samplingSnapshot.pixelRenderingEnabled,
      })
    ) {
      return;
    }

    this.pixelRenderingAutoTriggerArmed = false;
    this.samplingSnapshot = {
      ...this.samplingSnapshot,
      pixelRenderingEnabled: true,
    };
    this.fallbackAbSnapshots.clear();
  }

  setPanZoomState(frameId: string | undefined, nextState: ViewerPanZoomState) {
    this.ensureFrame(frameId);
    const current = this.frameSnapshot.panZoomState;
    if (
      current.presetScale === nextState.presetScale &&
      current.fineScale === nextState.fineScale &&
      current.x === nextState.x &&
      current.y === nextState.y
    ) {
      return;
    }

    this.frameSnapshot = { ...this.frameSnapshot, panZoomState: nextState };
    this.updatePixelRenderingAutomation(getViewerDisplayedScale(nextState));
    this.refreshAbSnapshot();
    this.emit();
  }

  setScale(frameId: string | undefined, nextScale: number) {
    const current = this.getFrame(frameId).panZoomState;
    this.setPanZoomState(
      frameId,
      normalizeViewerDisplayedScale(
        clampNumber(nextScale, VIEWER_MIN_PRESET_SCALE, VIEWER_MAX_PRESET_SCALE),
        current,
      ),
    );
  }

  setStageActive(frameId: string | undefined, nextActive: boolean) {
    this.ensureFrame(frameId);
    if (this.frameSnapshot.stageActive === nextActive) {
      return;
    }

    this.frameSnapshot = { ...this.frameSnapshot, stageActive: nextActive };
    this.refreshAbSnapshot();
    this.emit(true);
  }

  setSwipePosition(frameId: string | undefined, nextPosition: number) {
    this.ensureFrame(frameId);
    if (this.frameSnapshot.swipePosition === nextPosition) {
      return;
    }

    this.frameSnapshot = { ...this.frameSnapshot, swipePosition: nextPosition };
    this.emit(true);
  }

  setOverlayOpacity(nextOpacity: number) {
    if (this.overlayOpacity === nextOpacity) {
      return;
    }

    this.overlayOpacity = nextOpacity;
    this.emit();
  }

  resetFrame(frameId: string | undefined) {
    this.frameSnapshot = createFrameSnapshot(frameId);
    this.refreshAbSnapshot();
    this.emit(true);
  }

  resetAb(frameId: string | undefined) {
    this.ensureFrame(frameId);
    this.frameSnapshot = {
      ...this.frameSnapshot,
      panZoomState: DEFAULT_PAN_ZOOM,
      stageActive: false,
    };
    this.refreshAbSnapshot();
    this.emit(true);
  }

  togglePixelRendering(frameId: string | undefined) {
    const nextEnabled = !this.samplingSnapshot.pixelRenderingEnabled;
    const displayedScale = getViewerDisplayedScale(this.getFrame(frameId).panZoomState);

    if (nextEnabled && displayedScale >= AB_PIXEL_RENDERING_AUTO_SCALE) {
      this.pixelRenderingAutoTriggerArmed = false;
    }

    const shouldPrompt =
      !nextEnabled &&
      !this.pixelRenderingAutoEnableDisabled &&
      !this.pixelRenderingAutoPromptDismissed;
    this.samplingSnapshot = {
      pixelRenderingEnabled: nextEnabled,
      pixelRenderingAutoDisablePromptOpen: shouldPrompt,
    };
    this.fallbackAbSnapshots.clear();
    this.refreshAbSnapshot();
    this.emit(true);
  }

  keepPixelRenderingAutoEnable() {
    this.samplingSnapshot = {
      ...this.samplingSnapshot,
      pixelRenderingAutoDisablePromptOpen: false,
    };
    this.emit(true);
  }

  dismissPixelRenderingAutoPromptForSession() {
    this.pixelRenderingAutoPromptDismissed = true;
    this.keepPixelRenderingAutoEnable();
  }

  disablePixelRenderingAutoEnable() {
    this.pixelRenderingAutoEnableDisabled = true;
    this.keepPixelRenderingAutoEnable();
    writeViewerPixelRenderingAutoDisabledCookie();
  }

  hydratePixelRenderingPreference() {
    this.pixelRenderingAutoEnableDisabled = readViewerPixelRenderingAutoDisabledCookie();
  }

  dispose() {
    if (this.notificationFrame !== null) {
      this.cancelFrame?.(this.notificationFrame);
      this.notificationFrame = null;
    }
    this.listeners.clear();
  }
}

/** Creates one interaction store for the mounted viewer and resets its frame slice before paint. */
export function useViewerInteractionStore(frameId: string | undefined) {
  const storeRef = useRef<ViewerInteractionStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new ViewerInteractionStore(frameId);
  }
  const store = storeRef.current;

  useLayoutEffect(() => store.activateFrame(frameId), [frameId, store]);
  useEffect(() => {
    store.hydratePixelRenderingPreference();
    return () => store.dispose();
  }, [store]);

  return store;
}

export function useViewerAbInteraction(store: ViewerInteractionStore, frameId: string | undefined) {
  return useSyncExternalStore(
    store.subscribe,
    () => store.getAbSnapshot(frameId),
    () => store.getAbSnapshot(frameId),
  );
}

export function useViewerAbStageActive(store: ViewerInteractionStore, frameId: string | undefined) {
  return useSyncExternalStore(
    store.subscribe,
    () => store.getAbStageActive(frameId),
    () => store.getAbStageActive(frameId),
  );
}

export function useViewerSwipePosition(store: ViewerInteractionStore, frameId: string | undefined) {
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSwipePosition(frameId),
    () => store.getSwipePosition(frameId),
  );
}

export function useViewerOverlayOpacity(store: ViewerInteractionStore) {
  return useSyncExternalStore(store.subscribe, store.getOverlayOpacity, store.getOverlayOpacity);
}

export function useViewerPixelRenderingPromptOpen(store: ViewerInteractionStore) {
  return useSyncExternalStore(
    store.subscribe,
    store.getPixelRenderingAutoDisablePromptOpen,
    store.getPixelRenderingAutoDisablePromptOpen,
  );
}
