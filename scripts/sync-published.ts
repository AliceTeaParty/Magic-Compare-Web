import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  loadWorkspaceEnvFromModule,
  resolveWorkspaceRoot,
} from "../packages/shared-utils/src/workspace-env";

/**
 * Keeps the public app's `public/published` tree aligned with the runtime published root so
 * local dev and static export both read the same bundle layout.
 */
function main(): void {
  const workspaceRoot = resolveWorkspaceRoot(import.meta.url, 1);

  loadWorkspaceEnvFromModule(import.meta.url, 1);

  const sourceDir = process.env.MAGIC_COMPARE_PUBLISHED_ROOT
    ? path.resolve(process.env.MAGIC_COMPARE_PUBLISHED_ROOT)
    : path.join(workspaceRoot, "content", "published");
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
    return;
  }

  // The public site expects the directory to exist even before the first publish, so dev/build
  // can stay deterministic instead of branching on missing filesystem state.
  mkdirSync(destinationDir, { recursive: true });
}

main();
