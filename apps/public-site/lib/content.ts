import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parsePublishManifest, type PublishManifest } from "@magic-compare/content-schema";
import {
  getPublishedGroupsRoot,
  isHiddenDemoCaseSlug,
  shouldHideDemoContent,
} from "@/lib/runtime-config";

export interface PublishedGroupRouteAlias {
  caseSlug: string;
  groupSlug: string;
  publicSlug: string;
}

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

export async function listPublishedGroupRouteAliases(): Promise<PublishedGroupRouteAlias[]> {
  const publicSlugs = await listPublishedGroupSlugs();
  const manifests = await Promise.all(publicSlugs.map((publicSlug) => getPublishedManifest(publicSlug)));

  return manifests
    .filter((manifest): manifest is PublishManifest => Boolean(manifest))
    .map((manifest) => ({
      caseSlug: manifest.case.slug,
      groupSlug: manifest.group.slug,
      publicSlug: manifest.publicSlug,
    }));
}

export async function getPublishedGroupRouteAlias(
  caseSlug: string,
  groupSlug: string,
): Promise<PublishedGroupRouteAlias | null> {
  const aliases = await listPublishedGroupRouteAliases();
  return (
    aliases.find((alias) => alias.caseSlug === caseSlug && alias.groupSlug === groupSlug) ?? null
  );
}
