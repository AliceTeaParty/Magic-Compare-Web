import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parsePublishManifest, type PublishManifest } from "@magic-compare/content-schema";

const publishedGroupsRoot = path.resolve(process.cwd(), "../../content/published/groups");

export async function listPublishedGroupSlugs(): Promise<string[]> {
  try {
    const entries = await readdir(publishedGroupsRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

export async function getPublishedManifest(publicSlug: string): Promise<PublishManifest | null> {
  try {
    const filePath = path.join(publishedGroupsRoot, publicSlug, "manifest.json");
    const fileContents = await readFile(filePath, "utf8");
    return parsePublishManifest(JSON.parse(fileContents));
  } catch {
    return null;
  }
}
