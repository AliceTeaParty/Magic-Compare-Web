import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPublishedRoot, getPublicExportDir } from "../../runtime-config";

// Runtime helpers may execute from app code, scripts, or tests, so derive the repo root from this
// module location instead of trusting the caller's current working directory.
const WORKSPACE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../..",
);

export function getWorkspaceRoot(): string {
  return WORKSPACE_ROOT;
}

export function publicSiteDirectory(): string {
  return path.join(WORKSPACE_ROOT, "apps", "public-site");
}

export function publicBuildOutputDirectory(): string {
  return path.join(publicSiteDirectory(), "out");
}

export function publishedGroupsDirectory(): string {
  return path.join(getPublishedRoot(), "groups");
}

export function resolvePublicExportDirectory(): string {
  return getPublicExportDir();
}
