import type { ViewerMode } from "@magic-compare/content-schema";

const VIEWER_DETAILS_COOKIE_NAME = "magic_compare_open_details";
const VIEWER_MODE_COOKIE_NAME = "magic_compare_viewer_mode";
const VIEWER_PIXEL_RENDERING_AUTO_DISABLED_COOKIE_NAME =
  "magic_compare_pixel_rendering_auto_disabled";
const VIEWER_COOKIE_ATTRIBUTES = "Path=/; Max-Age=31536000; SameSite=Lax";

/** Reads one exact value from a cookie header without matching similarly prefixed names. */
function readCookieValueFromHeader(name: string, cookieHeader: string): string | null {
  const entry = cookieHeader.split("; ").find((part) => part.startsWith(`${name}=`));
  return entry ? (entry.split("=")[1] ?? null) : null;
}

/**
 * Reads a single cookie value without pulling in a heavier cookie helper because the viewer only
 * persists a small set of lightweight preferences on the client.
 */
function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  return readCookieValueFromHeader(name, document.cookie);
}

/** Serializes viewer cookies through one attribute policy so public and internal routes agree. */
function serializeCookieValue(name: string, value: string): string {
  return `${name}=${value}; ${VIEWER_COOKIE_ATTRIBUTES}`;
}

/**
 * Writes long-lived viewer preferences with a root path so the same setting survives route changes
 * between internal and public viewer pages.
 */
function writeCookieValue(name: string, value: string): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = serializeCookieValue(name, value);
}

/**
 * Treats only the explicit disabled marker as an opt-out so missing or malformed cookies retain
 * the default high-zoom assistance.
 */
export function parseViewerPixelRenderingAutoDisabledCookie(cookieHeader: string): boolean {
  return (
    readCookieValueFromHeader(VIEWER_PIXEL_RENDERING_AUTO_DISABLED_COOKIE_NAME, cookieHeader) ===
    "1"
  );
}

/** Returns the exact long-lived cookie written after a manual pixel-rendering close. */
export function serializeViewerPixelRenderingAutoDisabledCookie(): string {
  return serializeCookieValue(VIEWER_PIXEL_RENDERING_AUTO_DISABLED_COOKIE_NAME, "1");
}

/** Reads whether this browser has opted out of automatic high-zoom pixel rendering. */
export function readViewerPixelRenderingAutoDisabledCookie(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  return parseViewerPixelRenderingAutoDisabledCookie(document.cookie);
}

/** Persists the user's manual close so later high-zoom sessions do not override that decision. */
export function writeViewerPixelRenderingAutoDisabledCookie(): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = serializeViewerPixelRenderingAutoDisabledCookie();
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
