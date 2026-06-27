export type ViewerGuideState = "completed" | "dismissed";

const viewerGuideStorageKey = "magic_compare_viewer_guide_v1";

/**
 * Reads the local first-run guide state defensively because private browsing, enterprise policy,
 * or embedded public pages can make localStorage unavailable.
 */
export function readViewerGuideState(): ViewerGuideState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(viewerGuideStorageKey);
    if (value === "completed" || value === "dismissed") {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Persists the user's guide decision when possible, while keeping the viewer usable if storage is
 * blocked by browser settings.
 */
export function writeViewerGuideState(state: ViewerGuideState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(viewerGuideStorageKey, state);
  } catch {
    // Storage is a convenience for onboarding only; blocked writes should not affect inspection.
  }
}
