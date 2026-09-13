import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parsePublishManifest, type PublishManifest } from "@magic-compare/content-schema";
import { getPublishedRoot } from "@/lib/server/runtime-config";

export function getPublishedGroupDirectory(publicSlug: string): string {
  return path.join(getPublishedRoot(), "groups", publicSlug);
}

export async function resetPublishedGroup(publicSlug: string): Promise<void> {
  const directory = getPublishedGroupDirectory(publicSlug);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}

export async function deletePublishedGroup(publicSlug: string): Promise<void> {
  await rm(getPublishedGroupDirectory(publicSlug), { recursive: true, force: true });
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
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}
