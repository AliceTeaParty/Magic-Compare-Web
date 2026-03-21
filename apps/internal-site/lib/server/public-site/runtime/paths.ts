import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPublishedRoot, getPublicExportDir } from "../../runtime-config";

function workspaceRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../../../../..");
}

export function getWorkspaceRoot(): string {
  return workspaceRoot();
}

export function publicSiteDirectory(): string {
  return path.join(workspaceRoot(), "apps", "public-site");
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
