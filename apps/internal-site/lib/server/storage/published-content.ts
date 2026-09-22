import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parsePublishManifest, type PublishManifest } from "@magic-compare/content-schema";
import { getPublishedRoot } from "@/lib/server/runtime-config";
import { withPublicSiteOperationLock } from "@/lib/server/public-site/runtime/operation-lock";

export function getPublishedGroupDirectory(publicSlug: string): string {
  return path.join(getPublishedRoot(), "groups", publicSlug);
}

export async function deletePublishedGroup(publicSlug: string): Promise<void> {
  return withPublicSiteOperationLock("publish", async () => {
    await rm(getPublishedGroupDirectory(publicSlug), { recursive: true, force: true });
  });
}

/** Reads the previous snapshot only as an optimization cache; invalid legacy data is replaceable. */
export async function readPublishedManifest(publicSlug: string): Promise<PublishManifest | null> {
  try {
    const manifestPath = path.join(getPublishedGroupDirectory(publicSlug), "manifest.json");
    return parsePublishManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  } catch {
    return null;
  }
}

export async function writePublishedManifest(
  publicSlug: string,
  manifest: PublishManifest,
): Promise<void> {
  const manifestPath = path.join(getPublishedGroupDirectory(publicSlug), "manifest.json");
  const directory = path.dirname(manifestPath);
  const temporaryManifestPath = path.join(directory, `manifest.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });

  try {
    await writeFile(temporaryManifestPath, JSON.stringify(manifest, null, 2), "utf8");
    await rename(temporaryManifestPath, manifestPath);
  } finally {
    await rm(temporaryManifestPath, { force: true });
  }
}
