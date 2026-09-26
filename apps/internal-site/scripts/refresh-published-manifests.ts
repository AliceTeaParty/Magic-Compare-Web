import { readFile, readdir, rm } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { parsePublishManifest } from "@magic-compare/content-schema";
import { prisma } from "../lib/server/db/client";
import { buildPublishManifest } from "../lib/server/publish/build-publish-manifest";
import { enrichPublishManifestWithPlaceholders } from "../lib/server/publish/publish-image-placeholders";
import { getPublishedRoot } from "../lib/server/runtime-config";
import {
  readPublishedManifest,
  writePublishedManifest,
} from "../lib/server/storage/published-content";

type ActivePublicGroup = {
  id: string;
  caseSlug: string;
  publicSlug: string;
};

type StaleManifestScan = {
  prunedPublicSlugs: string[];
  skippedUnidentifiedDirectories: string[];
};

/** Removes only valid, self-identifying manifests that no longer match a published public group. */
export async function pruneStalePublishedManifests(
  activeGroups: readonly ActivePublicGroup[],
): Promise<StaleManifestScan> {
  const groupsDirectory = path.join(getPublishedRoot(), "groups");
  let entries: Dirent<string>[];
  try {
    entries = await readdir(groupsDirectory, { encoding: "utf8", withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { prunedPublicSlugs: [], skippedUnidentifiedDirectories: [] };
    }
    throw error;
  }

  const activeById = new Map(activeGroups.map((group) => [group.id, group]));
  const prunedPublicSlugs: string[] = [];
  const skippedUnidentifiedDirectories: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    let manifest: ReturnType<typeof parsePublishManifest>;
    try {
      const manifestPath = path.join(groupsDirectory, entry.name, "manifest.json");
      manifest = parsePublishManifest(JSON.parse(await readFile(manifestPath, "utf8")));
      if (manifest.publicSlug !== entry.name || manifest.group.publicSlug !== entry.name) {
        skippedUnidentifiedDirectories.push(entry.name);
        continue;
      }
    } catch {
      // Unreadable or malformed manifests do not provide enough identity to delete their directory.
      skippedUnidentifiedDirectories.push(entry.name);
      continue;
    }

    const active = activeById.get(manifest.group.id);
    if (active?.caseSlug === manifest.case.slug && active.publicSlug === entry.name) {
      continue;
    }

    await rm(path.join(groupsDirectory, entry.name), { recursive: true, force: true });
    prunedPublicSlugs.push(entry.name);
  }

  return { prunedPublicSlugs, skippedUnidentifiedDirectories };
}

/** Rebuilds eligible manifests and prunes identified stale bundles without changing publication fields. */
export async function refreshPublishedManifests() {
  const groups = await prisma.group.findMany({
    where: {
      case: { status: "published" },
      isPublic: true,
      publicSlug: { not: null },
      frames: { some: { isPublic: true } },
    },
    orderBy: [{ case: { slug: "asc" } }, { order: "asc" }],
    select: {
      id: true,
      slug: true,
      storageRoot: true,
      publicSlug: true,
      title: true,
      description: true,
      defaultMode: true,
      tagsJson: true,
      order: true,
      case: {
        select: {
          slug: true,
          title: true,
          subtitle: true,
          summary: true,
          tagsJson: true,
          publishedAt: true,
        },
      },
      frames: {
        where: { isPublic: true },
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          caption: true,
          order: true,
          isPublic: true,
          assets: {
            where: { isPublic: true },
            select: {
              id: true,
              kind: true,
              label: true,
              imageUrl: true,
              thumbUrl: true,
              width: true,
              height: true,
              note: true,
              isPublic: true,
              isPrimaryDisplay: true,
              imagePlaceholderJson: true,
            },
          },
        },
      },
    },
  });

  const refreshed: Array<{ publicSlug: string; caseSlug: string }> = [];
  const activeGroups: ActivePublicGroup[] = [];
  for (const group of groups) {
    // The query requires a non-null slug and at least one public frame.
    const publicSlug = group.publicSlug!;
    const previousManifest = await readPublishedManifest(publicSlug);
    const publishedAt =
      group.case.publishedAt ??
      (previousManifest?.case.publishedAt
        ? new Date(previousManifest.case.publishedAt)
        : new Date());
    const manifest = buildPublishManifest({
      caseRow: group.case,
      group,
      publicSlug,
      publishedAt,
    })!;
    const enriched = await enrichPublishManifestWithPlaceholders({
      manifest,
      previousManifest,
      sourceAssets: group.frames.flatMap((frame) => frame.assets),
    });

    await writePublishedManifest(publicSlug, enriched.manifest);
    refreshed.push({ publicSlug, caseSlug: group.case.slug });
    activeGroups.push({ id: group.id, caseSlug: group.case.slug, publicSlug });
  }

  const stale = await pruneStalePublishedManifests(activeGroups);
  return { refreshedCount: refreshed.length, refreshed, ...stale };
}

async function main() {
  console.log(JSON.stringify(await refreshPublishedManifests(), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } finally {
    await prisma.$disconnect();
  }
}
