const INTERNAL_GROUP_PATH_PATTERN = /^\/cases\/[^/]+\/groups\/[^/]+\/?$/;

/**
 * Keeps deployment monitoring on the current Group by reusing the exported compatibility route;
 * other internal pages retain the site-level destination because they do not identify one Group.
 */
export function resolvePublicDeployMonitorUrl(
  publicSiteUrl: string | null,
  internalPathname: string,
): string | null {
  if (!publicSiteUrl || !INTERNAL_GROUP_PATH_PATTERN.test(internalPathname)) {
    return publicSiteUrl;
  }

  try {
    return new URL(internalPathname.replace(/\/$/, ""), publicSiteUrl).toString();
  } catch {
    return publicSiteUrl;
  }
}
