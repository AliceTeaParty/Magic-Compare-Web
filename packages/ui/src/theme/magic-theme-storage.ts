export const MAGIC_THEME_SEED_COOKIE_NAME = "mc_internal_theme";

/** Reads the shared theme seed without assuming a server-only cookie API. */
export function readMagicThemeSeedCookie(cookieHeader: string): string | null {
  const prefix = `${MAGIC_THEME_SEED_COOKIE_NAME}=`;
  const encodedValue = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);

  if (!encodedValue) return null;

  try {
    return decodeURIComponent(encodedValue) || null;
  } catch {
    // A malformed cookie must not prevent the static public viewer from hydrating.
    return null;
  }
}

/** Serializes the theme seed consistently for the internal and public site shells. */
export function serializeMagicThemeSeedCookie(value: string): string {
  return `${MAGIC_THEME_SEED_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
