import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_CASE_SLUG, parseEnvFlag } from "@magic-compare/shared-utils";
import { loadWorkspaceEnv } from "./env/load-workspace-env";

export const HIDE_DEMO_ENV_NAME = "MAGIC_COMPARE_HIDE_DEMO";
export const PUBLISHED_ROOT_ENV_NAME = "MAGIC_COMPARE_PUBLISHED_ROOT";

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
    : path.join(workspaceRoot(), "content", "published");
  return path.join(publishedRoot, "groups");
}
