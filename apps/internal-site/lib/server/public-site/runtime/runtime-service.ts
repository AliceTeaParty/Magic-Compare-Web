import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
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
import { PublicSiteOperationConflictError, withPublicSiteOperationLock } from "./operation-lock";

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
 * Mirrors the Next.js export into the configured publish directory so local exports and deploys can
 * target an arbitrary output root without teaching Next.js about that environment-specific path.
 */
export async function mirrorExportDirectory(sourceDir: string, targetDir: string): Promise<void> {
  if (sourceDir === targetDir) {
    return;
  }

  await rm(targetDir, { recursive: true, force: true });
  // Create the parent explicitly because deploy targets may point outside the app tree and `cp`
  // will not materialize missing ancestors for us.
  await mkdir(dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });
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

  throw new Error(
    `No published groups were found in ${publishedGroupsDirectory()}. Publish at least one case first.`,
  );
}

/**
 * Builds the public app against the current published bundle and copies the static output into the
 * runtime export directory expected by local preview or deploy flows.
 */
async function performPublicExport(observer?: PublicDeployObserver): Promise<PublicExportResult> {
  const buildOutputDir = publicBuildOutputDirectory();
  const exportDir = resolvePublicExportDirectory();

  await ensurePublishedGroupsExist();
  await rm(buildOutputDir, { recursive: true, force: true });

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
    await ensurePublishedGroupsExist();
    const projectName = process.env[CF_PAGES_PROJECT_NAME_ENV_NAME]?.trim() || "";
    const branch = process.env[CF_PAGES_BRANCH_ENV_NAME]?.trim() || null;
    const fingerprint = await computePublicDeploymentFingerprint();

    if (await wasPublicDeploymentSuccessful(fingerprint)) {
      return {
        stdout: "Public site is already up to date.",
        stderr: "",
        buildOutputDir: publicBuildOutputDirectory(),
        exportDir: resolvePublicExportDirectory(),
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
