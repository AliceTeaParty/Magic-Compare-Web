import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..");

const safeGeneratedPaths = [
  "apps/internal-site/.next",
  "apps/public-site/.next",
  "apps/public-site/out",
  "apps/public-site/public/published",
  "dist",
  "coverage",
  ".turbo",
];

const optionalToolCacheDirNames = new Set(["__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"]);

/**
 * Remove only paths that this script discovered from an explicit allowlist.
 * That keeps `pnpm clean` safe for local data while still clearing tool caches.
 */
function removeIfExists(relativePath) {
  const targetPath = path.join(workspaceRoot, relativePath);
  if (!existsSync(targetPath)) {
    return false;
  }

  rmSync(targetPath, { recursive: true, force: true });
  return true;
}

/**
 * Python tool caches under `tools/` are optional byproducts and can be deleted opportunistically.
 * We recurse only inside `tools/` so this helper never wanders into app data or user work directories.
 */
function collectOptionalToolCachePaths(relativePath = "tools") {
  const targetPath = path.join(workspaceRoot, relativePath);
  if (!existsSync(targetPath)) {
    return [];
  }

  const collected = [];
  const entries = readdirSync(targetPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const childRelativePath = path.join(relativePath, entry.name);
    if (optionalToolCacheDirNames.has(entry.name)) {
      collected.push(childRelativePath);
      continue;
    }

    collected.push(...collectOptionalToolCachePaths(childRelativePath));
  }

  return collected;
}

/**
 * `pnpm clean` is intentionally conservative about durable content, but it should still reset
 * disposable JS build outputs and optional Python tool caches in one pass.
 */
function main() {
  const removed = [];
  const cleanupTargets = [...safeGeneratedPaths, ...collectOptionalToolCachePaths()];

  for (const relativePath of cleanupTargets) {
    if (removeIfExists(relativePath)) {
      removed.push(relativePath);
    }
  }

  if (removed.length === 0) {
    console.log("No generated caches or build outputs needed cleaning.");
    return;
  }

  console.log("Removed generated caches and build outputs:");
  for (const relativePath of removed) {
    console.log(`- ${relativePath}`);
  }
  console.log("");
  console.log("Skipped on purpose:");
  console.log("- content/ (published data root when using default host config)");
  console.log("- docker-data/ (persistent Docker runtime data)");
  console.log("- apps/internal-site/prisma/*.db (local SQLite data)");
}

main();
