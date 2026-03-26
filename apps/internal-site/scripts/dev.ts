import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import { loadWorkspaceEnv } from "../lib/server/env/load-workspace-env";
import {
  isInternalAssetStorageConfigured,
  shouldHideDemoContent,
} from "../lib/server/runtime-config";

function commandName(base: string): string {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

/**
 * Keeps local bootstrap consistent with the workspace package manager entrypoints so dev startup
 * exercises the same schema/seed commands developers would run manually.
 */
function runPnpm(script: "db:push" | "db:seed"): void {
  execFileSync(commandName("pnpm"), [script], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
}

/**
 * Keeps local dev startup aligned with the real demo workflow by always re-running the idempotent
 * seed step after schema sync. Only checking SQLite content is insufficient because a fresh S3
 * volume can still leave the viewer with metadata but no actual images.
 */
function ensureLocalDataReady(): void {
  loadWorkspaceEnv();
  runPnpm("db:push");

  if (shouldHideDemoContent()) {
    console.log("Skipping demo seed because MAGIC_COMPARE_HIDE_DEMO is enabled.");
    return;
  }

  if (!isInternalAssetStorageConfigured()) {
    console.log("Skipping demo seed because external S3/R2 storage is not configured.");
    return;
  }

  runPnpm("db:seed");
}

/**
 * Delegates to `next dev` instead of embedding a custom HTTP server so local iteration still
 * benefits from the framework's own reload and diagnostics behavior.
 */
async function startNextDev(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(commandName("next"), ["dev"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      if (code && code !== 0) {
        reject(new Error(`next dev exited with code ${code}`));
        return;
      }

      resolve();
    });

    child.on("error", reject);
  });
}

/**
 * Runs the data bootstrap before Next starts so a fresh object-store volume cannot leave the first
 * browser session on a metadata-only workspace with broken images.
 */
async function main() {
  ensureLocalDataReady();
  await startNextDev();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
