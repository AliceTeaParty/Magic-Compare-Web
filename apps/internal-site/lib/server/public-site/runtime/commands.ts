import { spawn } from "node:child_process";
import {
  getCfPagesBranch,
  getCfPagesProjectName,
} from "../../runtime-config";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

/**
 * Normalizes command names for Windows shells so runtime helpers can keep a single invocation path
 * for `pnpm` regardless of the host OS.
 */
function commandName(base: string): string {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

/**
 * Keeps the public build invocation in one place so export and test code cannot drift on the exact
 * app/package being built.
 */
export function getPublicSiteBuildArgs(): string[] {
  return ["--filter", "@magic-compare/public-site", "build"];
}

/**
 * Constructs the deploy command lazily from env so route handlers and tests both exercise the same
 * branch/project selection logic.
 */
export function getWranglerPagesDeployArgs(exportDir: string): string[] {
  const projectName = getCfPagesProjectName() ?? "";
  const branch = getCfPagesBranch();
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

/**
 * Captures stdout/stderr so deploy failures surface enough context in API responses instead of
 * forcing operators to rerun the command manually to see the real error.
 */
export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandResult> {
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
          [
            `Command failed: ${command} ${args.join(" ")}`,
            stderr.trim(),
            stdout.trim(),
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
}
