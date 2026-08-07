const LONG_LIVED_SITE_COOKIE_ATTRIBUTES = "Path=/; Max-Age=31536000; SameSite=Lax";

/** Reads and safely decodes one exact cookie name from headers with or without separator spaces. */
export function readCookieValue(cookieHeader: string, name: string): string | null {
  const prefix = `${name}=`;
  const encodedValue = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);

  if (encodedValue === undefined) {
    return null;
  }

  try {
    return decodeURIComponent(encodedValue);
  } catch {
    // Corrupt browser state must not prevent either static public hydration or internal startup.
    return null;
  }
}

/** Serializes one encoded, site-wide preference through the shared one-year retention policy. */
export function serializeCookieValue(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; ${LONG_LIVED_SITE_COOKIE_ATTRIBUTES}`;
}

/** Reads a client cookie without making modules that import this helper browser-only at load time. */
export function readDocumentCookieValue(name: string): string | null {
  return typeof document === "undefined" ? null : readCookieValue(document.cookie, name);
}

/** Writes a client preference while remaining a no-op during server rendering and static builds. */
export function writeDocumentCookieValue(name: string, value: string): void {
  if (typeof document !== "undefined") {
    document.cookie = serializeCookieValue(name, value);
  }
}
