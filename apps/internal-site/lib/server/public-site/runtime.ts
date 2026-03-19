import { spawn } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CF_API_TOKEN_ENV_NAME,
  CF_PAGES_BRANCH_ENV_NAME,
  CF_PAGES_PROJECT_NAME_ENV_NAME,
  getPublicExportDir,
  isCloudflarePagesDeployConfigured,
} from "../runtime-config";

interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface PublicExportResult extends CommandResult {
  buildOutputDir: string;
  exportDir: string;
}

export interface PublicDeployResult extends PublicExportResult {
  projectName: string;
  branch: string | null;
}

function workspaceRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../../../..");
}

function publicSiteDirectory(): string {
  return path.join(workspaceRoot(), "apps", "public-site");
}

function publicBuildOutputDirectory(): string {
  return path.join(publicSiteDirectory(), "out");
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

function commandName(base: string): string {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

async function runCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
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

async function mirrorExportDirectory(sourceDir: string, targetDir: string): Promise<void> {
  if (path.resolve(sourceDir) === path.resolve(targetDir)) {
    return;
  }

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(path.dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });
}

export async function exportPublicSite(): Promise<PublicExportResult> {
  const root = workspaceRoot();
  const buildOutputDir = publicBuildOutputDirectory();
  const exportDir = getPublicExportDir();
  const commandResult = await runCommand("pnpm", getPublicSiteBuildArgs(), root);
  await mirrorExportDirectory(buildOutputDir, exportDir);

  return {
    ...commandResult,
    buildOutputDir,
    exportDir,
  };
}

export async function deployPublicSite(): Promise<PublicDeployResult> {
  if (!isCloudflarePagesDeployConfigured()) {
    throw new Error(
      `Cloudflare Pages deploy is not configured. Missing ${CF_PAGES_PROJECT_NAME_ENV_NAME} or CLOUDFLARE credentials.`,
    );
  }

  const exportResult = await exportPublicSite();
  const projectName = process.env[CF_PAGES_PROJECT_NAME_ENV_NAME]?.trim() || "";
  const branch = process.env[CF_PAGES_BRANCH_ENV_NAME]?.trim() || null;
  const deployResult = await runCommand("pnpm", getWranglerPagesDeployArgs(exportResult.exportDir), workspaceRoot());

  if (!process.env[CF_API_TOKEN_ENV_NAME]?.trim()) {
    throw new Error("Cloudflare API token is missing.");
  }

  return {
    ...exportResult,
    stdout: [exportResult.stdout.trim(), deployResult.stdout.trim()].filter(Boolean).join("\n"),
    stderr: [exportResult.stderr.trim(), deployResult.stderr.trim()].filter(Boolean).join("\n"),
    projectName,
    branch,
  };
}
