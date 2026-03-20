import { existsSync, rmSync } from "node:fs";
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

function removeIfExists(relativePath) {
  const targetPath = path.join(workspaceRoot, relativePath);
  if (!existsSync(targetPath)) {
    return false;
  }

  rmSync(targetPath, { recursive: true, force: true });
  return true;
}

function main() {
  const removed = [];

  for (const relativePath of safeGeneratedPaths) {
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
