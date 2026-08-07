import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parsePublishManifest } from "../packages/content-schema/src/index";
import {
  loadWorkspaceEnvFromModule,
  resolveDefaultPublishedRoot,
  resolveWorkspaceRoot,
} from "../packages/shared-utils/src/workspace-env";

const PUBLIC_BASE_URL_ENV_NAME = "MAGIC_COMPARE_S3_PUBLIC_BASE_URL";
const INTERNAL_PREFIX_ENV_NAME = "MAGIC_COMPARE_S3_INTERNAL_PREFIX";

/** Refreshes only the disposable public build copy so delivery-host changes cannot leave stale URLs. */
function refreshCopiedManifests(destinationDir: string): void {
  const publicBaseUrl = process.env[PUBLIC_BASE_URL_ENV_NAME]?.trim();
  if (!publicBaseUrl) {
    return;
  }

  const currentBaseUrl = new URL(`${publicBaseUrl.replace(/\/+$/, "")}/`);
  const objectPrefix =
    process.env[INTERNAL_PREFIX_ENV_NAME]?.trim().replace(/^\/+|\/+$/g, "") ?? "";
  const groupsDir = path.join(destinationDir, "groups");
  if (!existsSync(groupsDir)) {
    return;
  }

  const refreshUrl = (sourceUrl: string) => {
    const source = URL.parse(sourceUrl);
    if (!source || (source.protocol !== "http:" && source.protocol !== "https:")) {
      return sourceUrl;
    }

    const logicalPathMatch = /\/(?:groups|internal-assets)\//.exec(source.pathname);
    if (!logicalPathMatch) {
      return sourceUrl;
    }

    const logicalPath = source.pathname.slice(logicalPathMatch.index + 1);
    const refreshed = new URL(
      [objectPrefix, logicalPath].filter(Boolean).join("/"),
      currentBaseUrl,
    );
    refreshed.search = source.search;
    refreshed.hash = source.hash;
    return refreshed.toString();
  };

  for (const entry of readdirSync(groupsDir, { withFileTypes: true })) {
    const manifestPath = path.join(groupsDir, entry.name, "manifest.json");
    if (!entry.isDirectory() || !existsSync(manifestPath)) {
      continue;
    }

    try {
      const manifest = parsePublishManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
      manifest.assetBasePath = refreshUrl(manifest.assetBasePath);
      for (const frame of manifest.frames) {
        for (const asset of frame.assets) {
          asset.imageUrl = refreshUrl(asset.imageUrl);
          asset.thumbUrl = refreshUrl(asset.thumbUrl);
        }
      }
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to refresh published manifest ${manifestPath}: ${reason}`, {
        cause: error,
      });
    }
  }
}

/**
 * Keeps the public app's `public/published` tree aligned with the runtime published root so
 * local dev and static export both read the same bundle layout.
 */
function main(): void {
  const workspaceRoot = resolveWorkspaceRoot(import.meta.url, 1);

  loadWorkspaceEnvFromModule(import.meta.url, 1);

  const sourceDir = process.env.MAGIC_COMPARE_PUBLISHED_ROOT
    ? path.resolve(process.env.MAGIC_COMPARE_PUBLISHED_ROOT)
    : resolveDefaultPublishedRoot(workspaceRoot);
  const destinationDir = path.join(workspaceRoot, "apps", "public-site", "public", "published");

  mkdirSync(path.dirname(destinationDir), { recursive: true });
  rmSync(destinationDir, { recursive: true, force: true });

  if (existsSync(sourceDir)) {
    cpSync(sourceDir, destinationDir, { recursive: true });
    refreshCopiedManifests(destinationDir);
    return;
  }

  // The public site expects the directory to exist even before the first publish, so dev/build
  // can stay deterministic instead of branching on missing filesystem state.
  mkdirSync(destinationDir, { recursive: true });
}

main();
