import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..");
const sourceDir = path.join(workspaceRoot, "content", "published");
const destinationDir = path.join(
  workspaceRoot,
  "apps",
  "public-site",
  "public",
  "published",
);

mkdirSync(path.dirname(destinationDir), { recursive: true });
rmSync(destinationDir, { recursive: true, force: true });

if (existsSync(sourceDir)) {
  cpSync(sourceDir, destinationDir, { recursive: true });
} else {
  mkdirSync(destinationDir, { recursive: true });
}
