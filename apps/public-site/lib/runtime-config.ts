import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_CASE_SLUG,
  HIDE_DEMO_ENV_NAME,
  parseEnvFlag,
  PUBLISHED_ROOT_ENV_NAME,
} from "@magic-compare/shared-utils";
import { resolveDefaultPublishedRoot } from "@magic-compare/shared-utils/workspace-env";
import { loadWorkspaceEnv } from "./env/load-workspace-env";

export const PUBLIC_SITE_BASE_URL_ENV_NAME = "MAGIC_COMPARE_PUBLIC_SITE_BASE_URL";

function workspaceRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../..");
}

export function shouldHideDemoContent(): boolean {
  loadWorkspaceEnv();
  return parseEnvFlag(process.env[HIDE_DEMO_ENV_NAME]);
}

export function isHiddenDemoCaseSlug(caseSlug: string): boolean {
  return shouldHideDemoContent() && caseSlug === DEMO_CASE_SLUG;
}

export function getPublishedGroupsRoot(): string {
  loadWorkspaceEnv();
  const configured = process.env[PUBLISHED_ROOT_ENV_NAME]?.trim();
  const publishedRoot = configured
    ? path.resolve(configured)
    : resolveDefaultPublishedRoot(workspaceRoot());
  return path.join(publishedRoot, "groups");
}

/** Resolves the public origin once so canonical and Open Graph URLs cannot disagree. */
export function getPublicSiteBaseUrl(): URL | null {
  loadWorkspaceEnv();
  const configured = process.env[PUBLIC_SITE_BASE_URL_ENV_NAME]?.trim();
  if (!configured) return null;

  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid protocol");
    return url;
  } catch {
    throw new Error(`${PUBLIC_SITE_BASE_URL_ENV_NAME} must be an absolute HTTP(S) URL.`);
  }
}
