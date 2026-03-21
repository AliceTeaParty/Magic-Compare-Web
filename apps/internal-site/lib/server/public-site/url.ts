import { CF_PAGES_PROJECT_NAME_ENV_NAME } from "../runtime-config";

export function resolvePublishedGroupUrl(publicSlug: string | null | undefined): string | null {
  if (!publicSlug) {
    return null;
  }

  const projectName = process.env[CF_PAGES_PROJECT_NAME_ENV_NAME]?.trim();

  if (!projectName) {
    return null;
  }

  return new URL(`/g/${publicSlug}`, `https://${projectName}.pages.dev`).toString();
}
