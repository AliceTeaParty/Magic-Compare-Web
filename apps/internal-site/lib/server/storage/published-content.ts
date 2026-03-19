import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PublishManifest } from "@magic-compare/content-schema";
import { getPublishedRoot } from "@/lib/server/runtime-config";
import { readInternalAsset } from "@/lib/server/storage/internal-assets";

export function getPublishedGroupDirectory(publicSlug: string): string {
  return path.join(getPublishedRoot(), "groups", publicSlug);
}

export function getPublishedAssetDirectory(publicSlug: string): string {
  return path.join(getPublishedGroupDirectory(publicSlug), "assets");
}

export async function resetPublishedGroup(publicSlug: string): Promise<void> {
  const directory = getPublishedGroupDirectory(publicSlug);
  await rm(directory, { recursive: true, force: true });
  await mkdir(getPublishedAssetDirectory(publicSlug), { recursive: true });
}

export async function deletePublishedGroup(publicSlug: string): Promise<void> {
  await rm(getPublishedGroupDirectory(publicSlug), { recursive: true, force: true });
}

export async function copyInternalAssetToPublished(
  assetUrl: string,
  publicSlug: string,
  fileName: string,
): Promise<string> {
  const target = path.join(getPublishedAssetDirectory(publicSlug), fileName);
  const asset = await readInternalAsset(assetUrl);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, asset.body);
  return target;
}

export async function writePublishedManifest(
  publicSlug: string,
  manifest: PublishManifest,
): Promise<void> {
  const manifestPath = path.join(getPublishedGroupDirectory(publicSlug), "manifest.json");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}
