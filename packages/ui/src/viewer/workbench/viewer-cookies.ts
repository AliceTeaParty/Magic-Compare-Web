import type { ViewerMode } from "@magic-compare/content-schema";

const VIEWER_DETAILS_COOKIE_NAME = "magic_compare_open_details";
const VIEWER_MODE_COOKIE_NAME = "magic_compare_viewer_mode";

export function readViewerDetailsCookie(): boolean | null {
  if (typeof document === "undefined") {
    return null;
  }

  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${VIEWER_DETAILS_COOKIE_NAME}=`));

  if (!entry) {
    return null;
  }

  const value = entry.split("=")[1];
  if (value === "1") {
    return true;
  }
  if (value === "0") {
    return false;
  }

  return null;
}

export function writeViewerDetailsCookie(open: boolean): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${VIEWER_DETAILS_COOKIE_NAME}=${open ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function readViewerModeCookie(): ViewerMode | null {
  if (typeof document === "undefined") {
    return null;
  }

  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${VIEWER_MODE_COOKIE_NAME}=`));

  if (!entry) {
    return null;
  }

  const value = decodeURIComponent(entry.split("=")[1] ?? "");
  if (value === "before-after" || value === "a-b" || value === "heatmap") {
    return value;
  }

  return null;
}

export function writeViewerModeCookie(mode: ViewerMode): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${VIEWER_MODE_COOKIE_NAME}=${encodeURIComponent(mode)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
