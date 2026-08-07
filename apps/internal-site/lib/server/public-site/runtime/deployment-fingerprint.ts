import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  getCfPagesBranch,
  getCfPagesProjectName,
  PUBLIC_SITE_BASE_URL_ENV_NAME,
} from "../../runtime-config";
import { getWorkspaceRoot, publishedGroupsDirectory } from "./paths";
import { readPublicDeployState, writePublicDeployState } from "./state-store";

const LAST_SUCCESS_FILENAME = "last-success.json";
const PUBLIC_SOURCE_PATHS = [
  "apps/public-site/app",
  "apps/public-site/lib",
  // Mounted branding bypasses source control, so its bytes must still invalidate the deployment
  // shortcut when an operator replaces a logo or favicon without changing its URL.
  "apps/public-site/public/branding",
  "apps/public-site/next.config.mjs",
  "apps/public-site/package.json",
  "packages/compare-core/src",
  "packages/content-schema/src",
  "packages/shared-utils/src",
  "packages/ui/src",
  "pnpm-lock.yaml",
  "scripts/sync-published.ts",
  "scripts/write-public-route-aliases.ts",
];

interface LastSuccessfulDeployment {
  fingerprint: string;
  projectName: string;
  branch: string | null;
  completedAt: string;
}

/** Returns files in stable relative-path order so the same deployment input produces one hash. */
async function listFiles(rootPath: string): Promise<string[]> {
  const rootStat = await stat(rootPath).catch(() => null);
  if (!rootStat) return [];
  if (rootStat.isFile()) return [rootPath];

  const entries = await readdir(rootPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => listFiles(path.join(rootPath, entry.name))),
  );
  return nested.flat();
}

/** Hashes public code and mounted branding bytes exactly because both directly control the export. */
async function hashPublicSource(hash: ReturnType<typeof createHash>) {
  const workspaceRoot = getWorkspaceRoot();
  for (const relativeRoot of PUBLIC_SOURCE_PATHS) {
    hash.update(relativeRoot);
    // The self-hosted image already contains the workspace. This runtime scan must not make
    // Turbopack trace every project file into the route bundle a second time.
    for (const filePath of await listFiles(
      path.join(/* turbopackIgnore: true */ workspaceRoot, relativeRoot),
    )) {
      hash.update(path.relative(workspaceRoot, filePath));
      hash.update(await readFile(filePath));
    }
  }
}

/**
 * Hashes manifest text but only binary metadata. Published bundles may contain large assets, and
 * reading every byte would trade deployment latency and disk wear for negligible extra certainty.
 */
async function hashPublishedTree(hash: ReturnType<typeof createHash>) {
  const publishedRoot = publishedGroupsDirectory();
  for (const filePath of await listFiles(publishedRoot)) {
    const relativePath = path.relative(publishedRoot, filePath);
    const fileStat = await stat(filePath);
    hash.update(relativePath);

    if (/\.(?:json|html|txt)$/i.test(filePath)) {
      hash.update(await readFile(filePath));
    } else {
      hash.update(`${fileStat.size}:${fileStat.mtimeMs}`);
    }
  }
}

/** Includes every input that can change public output or its Cloudflare deployment target. */
export async function computePublicDeploymentFingerprint(): Promise<string> {
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify({
      projectName: getCfPagesProjectName(),
      branch: getCfPagesBranch(),
      publicSiteBaseUrl: process.env[PUBLIC_SITE_BASE_URL_ENV_NAME]?.trim() || null,
      footerAuthor: process.env.MAGIC_COMPARE_FOOTER_AUTHOR?.trim() || null,
      footerJoinLabel: process.env.MAGIC_COMPARE_FOOTER_JOIN_US_LABEL?.trim() || null,
      footerJoinUrl: process.env.MAGIC_COMPARE_FOOTER_JOIN_US_URL?.trim() || null,
      footerYearStart: process.env.MAGIC_COMPARE_FOOTER_YEAR_START?.trim() || null,
      // Public brand assets change exported head tags and navigation even when manifests do not,
      // so they must invalidate the successful-deployment shortcut.
      publicFaviconUrl: process.env.MAGIC_COMPARE_PUBLIC_FAVICON_URL?.trim() || null,
      publicLogoUrl: process.env.MAGIC_COMPARE_PUBLIC_LOGO_URL?.trim() || null,
      appVersion: process.env.MAGIC_COMPARE_APP_VERSION?.trim() || null,
      commitHash: process.env.MAGIC_COMPARE_COMMIT_SHA?.trim() || null,
    }),
  );
  await hashPublicSource(hash);
  await hashPublishedTree(hash);
  return hash.digest("hex");
}

export async function wasPublicDeploymentSuccessful(fingerprint: string): Promise<boolean> {
  const state = await readPublicDeployState<LastSuccessfulDeployment>(LAST_SUCCESS_FILENAME);
  return state?.fingerprint === fingerprint;
}

/** Records the fingerprint only after Wrangler succeeds so failed deploys remain retryable. */
export async function recordSuccessfulPublicDeployment(fingerprint: string): Promise<void> {
  await writePublicDeployState(LAST_SUCCESS_FILENAME, {
    fingerprint,
    projectName: getCfPagesProjectName() ?? "",
    branch: getCfPagesBranch(),
    completedAt: new Date().toISOString(),
  } satisfies LastSuccessfulDeployment);
}
