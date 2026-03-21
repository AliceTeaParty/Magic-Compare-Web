import {
  CF_PAGES_PROJECT_NAME_ENV_NAME,
  PUBLIC_SITE_BASE_URL_ENV_NAME,
  getOptionalAbsoluteUrlEnv,
} from "../runtime-config";

export function resolvePublishedGroupUrl(publicSlug: string | null | undefined): string | null {
  if (!publicSlug) {
    return null;
  }

  const configuredPublicSiteUrl = getOptionalAbsoluteUrlEnv(PUBLIC_SITE_BASE_URL_ENV_NAME);
  if (configuredPublicSiteUrl) {
    return new URL(`/g/${publicSlug}`, configuredPublicSiteUrl).toString();
  }

  const projectName = process.env[CF_PAGES_PROJECT_NAME_ENV_NAME]?.trim();

  if (!projectName) {
    return null;
  }

  return new URL(`/g/${publicSlug}`, `https://${projectName}.pages.dev`).toString();
}
