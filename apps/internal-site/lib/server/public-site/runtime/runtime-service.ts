import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PublicDeployStage } from "../../../public-deploy-job";
import {
  CF_PAGES_BRANCH_ENV_NAME,
  CF_PAGES_PROJECT_NAME_ENV_NAME,
  isCloudflarePagesDeployConfigured,
} from "../../runtime-config";
import {
  CommandResult,
  getPublicSiteBuildArgs,
  getWranglerPagesDeployArgs,
  runCommand,
} from "./commands";
import {
  computePublicDeploymentFingerprint,
  recordSuccessfulPublicDeployment,
  wasPublicDeploymentSuccessful,
} from "./deployment-fingerprint";
import {
  getWorkspaceRoot,
  publicBuildOutputDirectory,
  publishedGroupsDirectory,
  resolvePublicExportDirectory,
} from "./paths";
import { withPublicSiteOperationLock } from "./operation-lock";

export interface PublicExportResult extends CommandResult {
  buildOutputDir: string;
  exportDir: string;
}

export interface PublicDeployResult extends PublicExportResult {
  projectName: string;
  branch: string | null;
  fingerprint: string;
  skipped: boolean;
}

export interface PublicDeployObserver {
  onStage?: (stage: PublicDeployStage) => void;
  onOutput?: (event: {
    source: "build" | "wrangler";
    stream: "stdout" | "stderr";
    text: string;
  }) => void;
}

/**
 * Clears transient build artifacts without replacing the directory itself. Docker may mount the
 * build directory as a volume, and removing that mount root fails with EBUSY on Linux.
 */
export async function clearDirectoryContents(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory);
  await Promise.all(
    entries.map((entry) => rm(join(directory, entry), { recursive: true, force: true })),
  );
}

function previousExportDirectory(targetDir: string): string {
  return `${targetDir}.previous`;
}

function temporaryExportDirectory(targetDir: string): string {
  return `${targetDir}.next`;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/** Restores the last complete export after an interrupted directory promotion. */
export async function recoverPreviousExportDirectory(targetDir: string): Promise<void> {
  if (await pathExists(targetDir)) {
    return;
  }

  const previousDir = previousExportDirectory(targetDir);
  if (await pathExists(previousDir)) {
    await rename(previousDir, targetDir);
  }
}

/**
 * Mirrors the Next.js export into the configured publish directory so local exports and deploys can
 * target an arbitrary output root without teaching Next.js about that environment-specific path.
 */
export async function mirrorExportDirectory(sourceDir: string, targetDir: string): Promise<void> {
  if (sourceDir === targetDir) {
    return;
  }

  // Create the parent explicitly because deploy targets may point outside the app tree and `cp`
  // will not materialize missing ancestors for us.
  await mkdir(dirname(targetDir), { recursive: true });
  await recoverPreviousExportDirectory(targetDir);

  const nextDir = temporaryExportDirectory(targetDir);
  const previousDir = previousExportDirectory(targetDir);
  await rm(nextDir, { recursive: true, force: true });

  try {
    await cp(sourceDir, nextDir, { recursive: true });
  } catch (error) {
    await rm(nextDir, { recursive: true, force: true });
    throw error;
  }

  if (!(await pathExists(targetDir))) {
    try {
      await rename(nextDir, targetDir);
    } finally {
      await rm(nextDir, { recursive: true, force: true });
    }
    return;
  }

  try {
    await rm(previousDir, { recursive: true, force: true });
    await rename(targetDir, previousDir);
    try {
      await rename(nextDir, targetDir);
    } catch (error) {
      await rename(previousDir, targetDir);
      throw error;
    }
  } finally {
    await rm(nextDir, { recursive: true, force: true });
  }
}

/**
 * Fails early when nothing has been published yet so export/deploy errors stay actionable instead
 * of surfacing as an opaque empty-site build.
 */
async function ensurePublishedGroupsExist(): Promise<void> {
  try {
    const entries = await readdir(publishedGroupsDirectory(), {
      withFileTypes: true,
    });
    if (entries.some((entry) => entry.isDirectory())) {
      return;
    }
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error(`在 ${publishedGroupsDirectory()} 中找不到已发布图组，请先发布至少一个项目。`);
}

/**
 * Builds the public app against the current published bundle and copies the static output into the
 * runtime export directory expected by local preview or deploy flows.
 */
async function performPublicExport(observer?: PublicDeployObserver): Promise<PublicExportResult> {
  const buildOutputDir = publicBuildOutputDirectory();
  const exportDir = resolvePublicExportDirectory();

  await recoverPreviousExportDirectory(exportDir);
  await ensurePublishedGroupsExist();
  await clearDirectoryContents(buildOutputDir);

  observer?.onStage?.("building");
  const commandResult = await runCommand("pnpm", getPublicSiteBuildArgs(), getWorkspaceRoot(), {
    // Deploys started by `next dev` inherit NODE_ENV=development. A nested `next build` rejects
    // that mixed environment and can fail while prerendering Next's own metadata boundaries.
    env: {
      NODE_ENV: "production",
      // The public build is transient and may use more heap than the idle internal-site server.
      NODE_OPTIONS:
        process.env.MAGIC_COMPARE_PUBLIC_BUILD_NODE_OPTIONS ?? "--max-old-space-size=1024",
    },
    // `next dev` exports TURBOPACK=1 to its process tree, while this nested build deliberately uses
    // `--webpack`; remove the inherited flag after env merging so Next sees only one bundler.
    unsetEnv: ["TURBOPACK"],
    onOutput: (event) => observer?.onOutput?.({ source: "build", ...event }),
  });
  observer?.onStage?.("preparing");
  await mirrorExportDirectory(buildOutputDir, exportDir);

  return {
    ...commandResult,
    buildOutputDir,
    exportDir,
  };
}

/**
 * Serializes export runs through the shared lock because build output directories are mutable and
 * concurrent writes would corrupt the generated site.
 */
export async function exportPublicSite(): Promise<PublicExportResult> {
  return withPublicSiteOperationLock("export", performPublicExport);
}

/** Validates configuration before a background job is accepted by the API. */
export function ensurePublicDeployConfigured(): void {
  if (!isCloudflarePagesDeployConfigured()) {
    throw new Error(
      `Cloudflare Pages deploy is not configured. Missing ${CF_PAGES_PROJECT_NAME_ENV_NAME} or CLOUDFLARE credentials.`,
    );
  }
}

/** Deploys the complete current published root without request-scoped content context. */
export async function deployPublicSite(
  observer?: PublicDeployObserver,
): Promise<PublicDeployResult> {
  ensurePublicDeployConfigured();

  return withPublicSiteOperationLock("deploy", async () => {
    observer?.onStage?.("checking");
    const exportDir = resolvePublicExportDirectory();
    await recoverPreviousExportDirectory(exportDir);
    await ensurePublishedGroupsExist();
    const projectName = process.env[CF_PAGES_PROJECT_NAME_ENV_NAME]?.trim() || "";
    const branch = process.env[CF_PAGES_BRANCH_ENV_NAME]?.trim() || null;
    const fingerprint = await computePublicDeploymentFingerprint();

    if (await wasPublicDeploymentSuccessful(fingerprint)) {
      return {
        stdout: "Public site is already up to date.",
        stderr: "",
        buildOutputDir: publicBuildOutputDirectory(),
        exportDir,
        projectName,
        branch,
        fingerprint,
        skipped: true,
      };
    }

    const exportResult = await performPublicExport(observer);
    observer?.onStage?.("uploading");
    const deployResult = await runCommand(
      "pnpm",
      getWranglerPagesDeployArgs(exportResult.exportDir),
      getWorkspaceRoot(),
      {
        env: {
          NODE_ENV: "production",
          NODE_OPTIONS:
            process.env.MAGIC_COMPARE_WRANGLER_NODE_OPTIONS ?? "--max-old-space-size=512",
        },
        onOutput: (event) => observer?.onOutput?.({ source: "wrangler", ...event }),
      },
    );
    try {
      await recordSuccessfulPublicDeployment(fingerprint);
    } catch (error) {
      // Cloudflare has already accepted the deploy. Losing the local skip marker should make the
      // next run slower, not falsely report this successful deployment as failed.
      console.error("[public-deploy] Failed to record the successful fingerprint:", error);
    }

    return {
      ...exportResult,
      stdout: [exportResult.stdout.trim(), deployResult.stdout.trim()].filter(Boolean).join("\n"),
      stderr: [exportResult.stderr.trim(), deployResult.stderr.trim()].filter(Boolean).join("\n"),
      projectName,
      branch,
      fingerprint,
      skipped: false,
    };
  });
}
