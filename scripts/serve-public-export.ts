import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  loadWorkspaceEnvFromModule,
  resolveDefaultPublicExportDir,
  resolveWorkspaceRoot,
} from "../packages/shared-utils/src/workspace-env";

const PUBLIC_PREVIEW_PORT = "3001";

function commandName(base: string): string {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

/**
 * Serves the persistent export directory so dev:all monitors the exact files produced by deploy,
 * while an empty first-run directory can stay online until the first deployment completes.
 */
async function main(): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot(import.meta.url, 1);
  loadWorkspaceEnvFromModule(import.meta.url, 1);
  const configuredExportDir = process.env.MAGIC_COMPARE_PUBLIC_EXPORT_DIR?.trim();
  const exportDir = configuredExportDir
    ? path.resolve(configuredExportDir)
    : resolveDefaultPublicExportDir(workspaceRoot);

  await mkdir(exportDir, { recursive: true });
  console.log(`Monitoring public deploy output at http://localhost:${PUBLIC_PREVIEW_PORT}`);
  console.log(`Serving ${exportDir}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(commandName("serve"), [exportDir, "--listen", PUBLIC_PREVIEW_PORT], {
      cwd: workspaceRoot,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code && code !== 0) {
        reject(new Error(`Public export monitor exited with code ${code}.`));
        return;
      }
      resolve();
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
