import type { ViewerMode } from "@magic-compare/content-schema";

const VIEWER_DETAILS_COOKIE_NAME = "magic_compare_open_details";
const VIEWER_MODE_COOKIE_NAME = "magic_compare_viewer_mode";

/**
 * Reads a single cookie value without pulling in a heavier cookie helper because the viewer only
 * persists two lightweight preferences on the client.
 */
function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return entry ? entry.split("=")[1] ?? null : null;
}

/**
 * Writes long-lived viewer preferences with a root path so the same setting survives route changes
 * between internal and public viewer pages.
 */
function writeCookieValue(name: string, value: string): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/**
 * Returns null for malformed cookie values so new viewer modes can fail closed instead of silently
 * toggling the details panel.
 */
export function readViewerDetailsCookie(): boolean | null {
  const value = readCookieValue(VIEWER_DETAILS_COOKIE_NAME);
  if (value === null) {
    return null;
  }

  if (value === "1") {
    return true;
  }
  if (value === "0") {
    return false;
  }

  return null;
}

/**
 * Persists the details-panel preference locally because this UX choice is per-browser and does not
 * belong in shared published data.
 */
export function writeViewerDetailsCookie(open: boolean): void {
  writeCookieValue(VIEWER_DETAILS_COOKIE_NAME, open ? "1" : "0");
}

/**
 * Returns null for unknown values so stale cookies from previous viewer experiments cannot lock the
 * app into an unsupported mode.
 */
export function readViewerModeCookie(): ViewerMode | null {
  const value = readCookieValue(VIEWER_MODE_COOKIE_NAME);
  if (!value) {
    return null;
  }

  const decodedValue = decodeURIComponent(value);
  if (decodedValue === "before-after" || decodedValue === "a-b" || decodedValue === "heatmap") {
    return decodedValue;
  }

  return null;
}

/**
 * Encodes the mode before writing so the cookie stays robust if mode identifiers ever pick up URL
 * significant characters again.
 */
export function writeViewerModeCookie(mode: ViewerMode): void {
  writeCookieValue(VIEWER_MODE_COOKIE_NAME, encodeURIComponent(mode));
}
