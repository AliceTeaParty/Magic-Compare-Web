import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PublishManifest } from "@magic-compare/content-schema";
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

export async function writePublishedManifest(
  publicSlug: string,
  manifest: PublishManifest,
): Promise<void> {
  const manifestPath = path.join(getPublishedGroupDirectory(publicSlug), "manifest.json");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}
