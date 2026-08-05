import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import { loadWorkspaceEnv } from "../lib/server/env/load-workspace-env";
import {
  isInternalAssetStorageConfigured,
  shouldHideDemoContent,
} from "../lib/server/runtime-config";
import { initializeSqliteDatabase } from "../prisma/init-db";

function commandName(base: string): string {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

/** Runs the network-backed demo repair only for the explicit bootstrap command. */
function runDemoSeed(): void {
  execFileSync(commandName("pnpm"), ["db:seed"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
}

/**
 * Schema sync is local and cheap enough for every start. Demo repair touches SQLite, object storage,
 * and published bundles, so it only runs when `dev:bootstrap` explicitly requests it.
 */
function ensureLocalDataReady(seedDemo: boolean): void {
  loadWorkspaceEnv();
  const schemaStartedAt = performance.now();
  initializeSqliteDatabase();
  console.log(`SQLite schema ready in ${Math.round(performance.now() - schemaStartedAt)}ms.`);

  if (!seedDemo) {
    console.log(
      "Demo seed skipped. Run `pnpm dev:bootstrap` when the bundled sample needs repair.",
    );
    return;
  }

  if (shouldHideDemoContent()) {
    console.log("Skipping demo seed because MAGIC_COMPARE_HIDE_DEMO is enabled.");
    return;
  }

  if (!isInternalAssetStorageConfigured()) {
    console.log("Skipping demo seed because external S3/R2 storage is not configured.");
    return;
  }

  runDemoSeed();
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
      // A shell-level production value makes Next dev select the wrong behavior and emit warnings.
      env: { ...process.env, NODE_ENV: "development" },
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
  const seedDemo = process.argv.slice(2).includes("--seed");
  ensureLocalDataReady(seedDemo);
  await startNextDev();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
