import type { ViewerMode } from "@magic-compare/content-schema";
import {
  readCookieValue,
  readDocumentCookieValue,
  serializeCookieValue,
  writeDocumentCookieValue,
} from "../../storage/browser-cookie";

const VIEWER_DETAILS_COOKIE_NAME = "magic_compare_open_details";
const VIEWER_MODE_COOKIE_NAME = "magic_compare_viewer_mode";
const VIEWER_PIXEL_RENDERING_AUTO_DISABLED_COOKIE_NAME =
  "magic_compare_pixel_rendering_auto_disabled";

/** Converts the details cookie's compact wire value without treating unknown values as false. */
function parseViewerDetailsValue(value: string | null): boolean | null {
  return value === "1" ? true : value === "0" ? false : null;
}

/** Keeps stale or unknown mode identifiers from entering the viewer controller. */
function parseViewerModeValue(value: string | null): ViewerMode | null {
  return value === "before-after" || value === "a-b" || value === "heatmap" ? value : null;
}

/**
 * Treats only the explicit disabled marker as an opt-out so missing or malformed cookies retain
 * the default high-zoom assistance.
 */
export function parseViewerPixelRenderingAutoDisabledCookie(cookieHeader: string): boolean {
  return readCookieValue(cookieHeader, VIEWER_PIXEL_RENDERING_AUTO_DISABLED_COOKIE_NAME) === "1";
}

/** Returns the exact long-lived cookie written after a manual pixel-rendering close. */
export function serializeViewerPixelRenderingAutoDisabledCookie(): string {
  return serializeCookieValue(VIEWER_PIXEL_RENDERING_AUTO_DISABLED_COOKIE_NAME, "1");
}

/** Reads whether this browser has opted out of automatic high-zoom nearest-neighbor sampling. */
export function readViewerPixelRenderingAutoDisabledCookie(): boolean {
  return readDocumentCookieValue(VIEWER_PIXEL_RENDERING_AUTO_DISABLED_COOKIE_NAME) === "1";
}

/** Persists the user's manual close so later high-zoom sessions do not override that decision. */
export function writeViewerPixelRenderingAutoDisabledCookie(): void {
  writeDocumentCookieValue(VIEWER_PIXEL_RENDERING_AUTO_DISABLED_COOKIE_NAME, "1");
}

/** Parses details from a supplied header so malformed browser state can be covered without a DOM. */
export function parseViewerDetailsCookie(cookieHeader: string): boolean | null {
  return parseViewerDetailsValue(readCookieValue(cookieHeader, VIEWER_DETAILS_COOKIE_NAME));
}

/**
 * Returns null for malformed cookie values so new viewer modes can fail closed instead of silently
 * toggling the details panel.
 */
export function readViewerDetailsCookie(): boolean | null {
  return parseViewerDetailsValue(readDocumentCookieValue(VIEWER_DETAILS_COOKIE_NAME));
}

/**
 * Persists the details-panel preference locally because this UX choice is per-browser and does not
 * belong in shared published data.
 */
export function writeViewerDetailsCookie(open: boolean): void {
  writeDocumentCookieValue(VIEWER_DETAILS_COOKIE_NAME, open ? "1" : "0");
}

/** Parses mode cookies through the shared safe decoder so bad URL encoding cannot break startup. */
export function parseViewerModeCookie(cookieHeader: string): ViewerMode | null {
  return parseViewerModeValue(readCookieValue(cookieHeader, VIEWER_MODE_COOKIE_NAME));
}

/**
 * Returns null for unknown values so stale cookies from previous viewer experiments cannot lock the
 * app into an unsupported mode.
 */
export function readViewerModeCookie(): ViewerMode | null {
  return parseViewerModeValue(readDocumentCookieValue(VIEWER_MODE_COOKIE_NAME));
}

/**
 * Encodes the mode before writing so the cookie stays robust if mode identifiers ever pick up URL
 * significant characters again.
 */
export function writeViewerModeCookie(mode: ViewerMode): void {
  writeDocumentCookieValue(VIEWER_MODE_COOKIE_NAME, mode);
}
