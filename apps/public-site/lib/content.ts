import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parsePublishManifest, type PublishManifest } from "@magic-compare/content-schema";
import {
  getPublishedGroupsRoot,
  isHiddenDemoCaseSlug,
  shouldHideDemoContent,
} from "@/lib/runtime-config";

export async function listPublishedGroupSlugs(): Promise<string[]> {
  try {
    const entries = await readdir(getPublishedGroupsRoot(), { withFileTypes: true });
    const slugs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

    if (!shouldHideDemoContent()) {
      return slugs;
    }

    const visibleSlugs = await Promise.all(
      slugs.map(async (publicSlug) => {
        const manifest = await getPublishedManifest(publicSlug);
        return manifest ? publicSlug : null;
      }),
    );

    return visibleSlugs.filter((publicSlug): publicSlug is string => Boolean(publicSlug));
  } catch {
    return [];
  }
}

export async function getPublishedManifest(publicSlug: string): Promise<PublishManifest | null> {
  try {
    const filePath = path.join(getPublishedGroupsRoot(), publicSlug, "manifest.json");
    const fileContents = await readFile(filePath, "utf8");
    const manifest = parsePublishManifest(JSON.parse(fileContents));
    if (isHiddenDemoCaseSlug(manifest.case.slug)) {
      return null;
    }
    return manifest;
  } catch {
    return null;
  }
}
