import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import { loadWorkspaceEnv } from "../lib/server/env/load-workspace-env";
import { resolveSqliteDatabasePath } from "../lib/server/db/database-url";

function commandName(base: string): string {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

function runPnpm(script: "db:push" | "db:seed"): void {
  execFileSync(commandName("pnpm"), [script], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
}

function readCaseCount(databasePath: string): number {
  const output = execFileSync(
    commandName("sqlite3"),
    [databasePath, 'SELECT COUNT(*) FROM "Case";'],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "inherit"],
      env: process.env,
      encoding: "utf8",
    },
  );

  const count = Number(output.trim());
  if (!Number.isFinite(count)) {
    throw new Error(`Failed to parse case count from SQLite output: ${output}`);
  }

  return count;
}

function ensureSeededDatabase(): void {
  loadWorkspaceEnv();
  runPnpm("db:push");

  const databasePath = resolveSqliteDatabasePath();
  const caseCount = readCaseCount(databasePath);

  if (caseCount > 0) {
    return;
  }

  console.log("Database is empty. Running db:seed before next dev.");
  runPnpm("db:seed");
}

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

async function main() {
  ensureSeededDatabase();
  await startNextDev();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
