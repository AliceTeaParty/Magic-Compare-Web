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

/**
 * Mirrors the Next.js export into the configured publish directory so local exports and deploys can
 * target an arbitrary output root without teaching Next.js about that environment-specific path.
 */
async function mirrorExportDirectory(sourceDir: string, targetDir: string): Promise<void> {
  if (sourceDir === targetDir) {
    return;
  }

  await rm(targetDir, { recursive: true, force: true });
  // Create the parent explicitly because deploy targets may point outside the app tree and `cp`
  // will not materialize missing ancestors for us.
  await mkdir(new URL(`file://${targetDir}`).pathname.replace(/\/[^/]*$/, ""), { recursive: true }).catch(
    async () => mkdir(targetDir.substring(0, targetDir.lastIndexOf("/")), { recursive: true }),
  );
  await cp(sourceDir, targetDir, { recursive: true });
}

/**
 * Fails early when nothing has been published yet so export/deploy errors stay actionable instead
 * of surfacing as an opaque empty-site build.
 */
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

/**
 * Builds the public app against the current published bundle and copies the static output into the
 * runtime export directory expected by local preview or deploy flows.
 */
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

/**
 * Maps the runtime lock error to HTTP status so route handlers can distinguish "already running"
 * from ordinary operator errors.
 */
export function getPublicSiteOperationErrorStatus(error: unknown): number {
  return error instanceof PublicSiteOperationConflictError ? 409 : 400;
}

/**
 * Serializes export runs through the shared lock because build output directories are mutable and
 * concurrent writes would corrupt the generated site.
 */
export async function exportPublicSite(): Promise<PublicExportResult> {
  return withPublicSiteOperationLock("export", performPublicExport);
}

/**
 * Optionally republishes one case before exporting so the deploy path can produce a fresh public
 * site in one operator action without requiring a separate manual publish step.
 */
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
