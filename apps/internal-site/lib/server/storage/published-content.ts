import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PublishManifest } from "@magic-compare/content-schema";

const workspaceRoot = path.resolve(process.cwd(), "../..");
const publishedRoot = path.join(workspaceRoot, "content", "published");
const internalPublicRoot = path.join(process.cwd(), "public");

export function getPublishedGroupDirectory(publicSlug: string): string {
  return path.join(publishedRoot, "groups", publicSlug);
}

export function getPublishedAssetDirectory(publicSlug: string): string {
  return path.join(getPublishedGroupDirectory(publicSlug), "assets");
}

export function resolveInternalAssetFile(assetUrl: string): string {
  const normalizedUrl = assetUrl.replace(/^\/+/, "");
  return path.join(internalPublicRoot, normalizedUrl);
}

export async function resetPublishedGroup(publicSlug: string): Promise<void> {
  const directory = getPublishedGroupDirectory(publicSlug);
  await rm(directory, { recursive: true, force: true });
  await mkdir(getPublishedAssetDirectory(publicSlug), { recursive: true });
}

export async function copyInternalAssetToPublished(
  assetUrl: string,
  publicSlug: string,
  fileName: string,
): Promise<string> {
  const source = resolveInternalAssetFile(assetUrl);
  const target = path.join(getPublishedAssetDirectory(publicSlug), fileName);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
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
