import { spawn } from "node:child_process";
import {
  CF_PAGES_BRANCH_ENV_NAME,
  CF_PAGES_PROJECT_NAME_ENV_NAME,
} from "../../runtime-config";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

function commandName(base: string): string {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

export function getPublicSiteBuildArgs(): string[] {
  return ["--filter", "@magic-compare/public-site", "build"];
}

export function getWranglerPagesDeployArgs(exportDir: string): string[] {
  const projectName = process.env[CF_PAGES_PROJECT_NAME_ENV_NAME]?.trim() || "";
  const branch = process.env[CF_PAGES_BRANCH_ENV_NAME]?.trim() || null;
  const args = [
    "exec",
    "wrangler",
    "pages",
    "deploy",
    exportDir,
    "--project-name",
    projectName,
  ];

  if (branch) {
    args.push("--branch", branch);
  }

  return args;
}

export async function runCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName(command), args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          [`Command failed: ${command} ${args.join(" ")}`, stderr.trim(), stdout.trim()]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
}
