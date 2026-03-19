import { access, rm } from "node:fs/promises";
import path from "node:path";

const runtimeInternalAssetRoot = path.join(process.cwd(), ".runtime", "internal-assets");
const legacyPublicInternalAssetRoot = path.join(process.cwd(), "public", "internal-assets");

function hasTraversal(input: string): boolean {
  return input.split("/").some((segment) => segment === ".." || segment.length === 0);
}

function assetRelativePath(assetUrl: string): string {
  const normalizedUrl = assetUrl.replace(/^\/+/, "");
  if (!normalizedUrl.startsWith("internal-assets/")) {
    throw new Error(`Unsupported internal asset url: ${assetUrl}`);
  }

  const relativePath = normalizedUrl.slice("internal-assets/".length);
  if (!relativePath || hasTraversal(relativePath)) {
    throw new Error(`Invalid internal asset path: ${assetUrl}`);
  }

  return relativePath;
}

export function getRuntimeInternalAssetRoot(): string {
  return runtimeInternalAssetRoot;
}

export function resolveRuntimeInternalAssetFile(assetUrl: string): string {
  return path.join(runtimeInternalAssetRoot, assetRelativePath(assetUrl));
}

export function resolveLegacyInternalAssetFile(assetUrl: string): string {
  return path.join(legacyPublicInternalAssetRoot, assetRelativePath(assetUrl));
}

export async function deleteInternalAssetGroupDirectories(
  caseSlug: string,
  groupSlug: string,
): Promise<void> {
  await Promise.all([
    rm(path.join(runtimeInternalAssetRoot, caseSlug, groupSlug), {
      recursive: true,
      force: true,
    }),
    rm(path.join(legacyPublicInternalAssetRoot, caseSlug, groupSlug), {
      recursive: true,
      force: true,
    }),
  ]);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveExistingInternalAssetFile(assetUrl: string): Promise<string> {
  const runtimePath = resolveRuntimeInternalAssetFile(assetUrl);
  if (await fileExists(runtimePath)) {
    return runtimePath;
  }

  const legacyPath = resolveLegacyInternalAssetFile(assetUrl);
  if (await fileExists(legacyPath)) {
    return legacyPath;
  }

  throw new Error(`Internal asset not found: ${assetUrl}`);
}
