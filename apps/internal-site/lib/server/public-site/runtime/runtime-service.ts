import { cp, mkdir, readdir, rm } from "node:fs/promises";
import {
  CF_PAGES_BRANCH_ENV_NAME,
  CF_PAGES_PROJECT_NAME_ENV_NAME,
  isCloudflarePagesDeployConfigured,
} from "../../runtime-config";
import { publishCase } from "../../publish/publish-case";
import {
  CommandResult,
  getPublicSiteBuildArgs,
  getWranglerPagesDeployArgs,
  runCommand,
} from "./commands";
import {
  getWorkspaceRoot,
  publicBuildOutputDirectory,
  publicSiteDirectory,
  publishedGroupsDirectory,
  resolvePublicExportDirectory,
} from "./paths";
import { PublicSiteOperationConflictError, withPublicSiteOperationLock } from "./operation-lock";

export interface PublicExportResult extends CommandResult {
  buildOutputDir: string;
  exportDir: string;
}

export interface PublicDeployResult extends PublicExportResult {
  projectName: string;
  branch: string | null;
}

async function mirrorExportDirectory(sourceDir: string, targetDir: string): Promise<void> {
  if (sourceDir === targetDir) {
    return;
  }

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(new URL(`file://${targetDir}`).pathname.replace(/\/[^/]*$/, ""), { recursive: true }).catch(
    async () => mkdir(targetDir.substring(0, targetDir.lastIndexOf("/")), { recursive: true }),
  );
  await cp(sourceDir, targetDir, { recursive: true });
}

async function ensurePublishedGroupsExist(): Promise<void> {
  try {
    const entries = await readdir(publishedGroupsDirectory(), { withFileTypes: true });
    if (entries.some((entry) => entry.isDirectory())) {
      return;
    }
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error(
    `No published groups were found in ${publishedGroupsDirectory()}. Publish at least one case first.`,
  );
}

async function performPublicExport(): Promise<PublicExportResult> {
  const buildOutputDir = publicBuildOutputDirectory();
  const exportDir = resolvePublicExportDirectory();

  await ensurePublishedGroupsExist();
  await rm(`${publicSiteDirectory()}/.next`, { recursive: true, force: true });
  await rm(buildOutputDir, { recursive: true, force: true });

  const commandResult = await runCommand("pnpm", getPublicSiteBuildArgs(), getWorkspaceRoot());
  await mirrorExportDirectory(buildOutputDir, exportDir);

  return {
    ...commandResult,
    buildOutputDir,
    exportDir,
  };
}

export function getPublicSiteOperationErrorStatus(error: unknown): number {
  return error instanceof PublicSiteOperationConflictError ? 409 : 400;
}

export async function exportPublicSite(): Promise<PublicExportResult> {
  return withPublicSiteOperationLock("export", performPublicExport);
}

export async function deployPublicSite(caseId?: string): Promise<PublicDeployResult> {
  if (!isCloudflarePagesDeployConfigured()) {
    throw new Error(
      `Cloudflare Pages deploy is not configured. Missing ${CF_PAGES_PROJECT_NAME_ENV_NAME} or CLOUDFLARE credentials.`,
    );
  }

  return withPublicSiteOperationLock("deploy", async () => {
    if (caseId) {
      await publishCase(caseId);
    }

    const exportResult = await performPublicExport();
    const projectName = process.env[CF_PAGES_PROJECT_NAME_ENV_NAME]?.trim() || "";
    const branch = process.env[CF_PAGES_BRANCH_ENV_NAME]?.trim() || null;
    const deployResult = await runCommand(
      "pnpm",
      getWranglerPagesDeployArgs(exportResult.exportDir),
      getWorkspaceRoot(),
    );

    return {
      ...exportResult,
      stdout: [exportResult.stdout.trim(), deployResult.stdout.trim()].filter(Boolean).join("\n"),
      stderr: [exportResult.stderr.trim(), deployResult.stderr.trim()].filter(Boolean).join("\n"),
      projectName,
      branch,
    };
  });
}
