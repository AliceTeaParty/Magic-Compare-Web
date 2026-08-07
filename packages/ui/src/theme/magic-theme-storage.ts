import { readCookieValue, serializeCookieValue } from "../storage/browser-cookie";

export const MAGIC_THEME_SEED_COOKIE_NAME = "mc_internal_theme";

/** Reads the shared theme seed without assuming a server-only cookie API. */
export function readMagicThemeSeedCookie(cookieHeader: string): string | null {
  return readCookieValue(cookieHeader, MAGIC_THEME_SEED_COOKIE_NAME) || null;
}

/** Serializes the theme seed consistently for the internal and public site shells. */
export function serializeMagicThemeSeedCookie(value: string): string {
  return serializeCookieValue(MAGIC_THEME_SEED_COOKIE_NAME, value);
}
