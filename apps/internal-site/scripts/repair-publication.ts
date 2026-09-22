import { readFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { parsePublishManifest } from "@magic-compare/content-schema";
import { prisma } from "../lib/server/db/client";
import {
  recomputeCaseCoverAsset,
  syncCasePublicationState,
} from "../lib/server/content/case-maintenance";
import { publishCase } from "../lib/server/publish/publish-case";
import { getPublishedRoot } from "../lib/server/runtime-config";
import { deletePublishedGroup } from "../lib/server/storage/published-content";

type PublishedBundleScan = {
  stalePublicSlugs: string[];
  skippedDirectories: string[];
};

function readCaseSlugArgument(): string {
  const [caseSlug, ...extraArguments] = process.argv.slice(2);
  const trimmedCaseSlug = caseSlug?.trim();
  if (!trimmedCaseSlug || extraArguments.length > 0) {
    throw new Error("Usage: tsx scripts/repair-publication.ts <caseSlug>");
  }
  return trimmedCaseSlug;
}

/**
 * Scans the public URL namespace after republishing current groups. A valid manifest identifies
 * its owning case by slug, while group ids keep active groups from being pruned as stale bundles.
 */
async function findStalePublishedBundles(
  caseSlug: string,
  activePublicGroupIds: Set<string>,
): Promise<PublishedBundleScan> {
  const groupsDirectory = path.join(getPublishedRoot(), "groups");
  let entries: Dirent<string>[];
  try {
    entries = await readdir(groupsDirectory, { encoding: "utf8", withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { stalePublicSlugs: [], skippedDirectories: [] };
    }
    throw error;
  }

  const stalePublicSlugs: string[] = [];
  const skippedDirectories: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      const manifestPath = path.join(groupsDirectory, entry.name, "manifest.json");
      const manifest = parsePublishManifest(JSON.parse(await readFile(manifestPath, "utf8")));
      if (manifest.case.slug !== caseSlug) {
        continue;
      }
      if (!activePublicGroupIds.has(manifest.group.id)) {
        stalePublicSlugs.push(entry.name);
      }
    } catch {
      // A missing or malformed manifest has no trustworthy case identity, so leave it untouched.
      skippedDirectories.push(entry.name);
    }
  }

  return { stalePublicSlugs, skippedDirectories };
}

/** Rebuilds one Case's derived public manifests and removes stale bundles in its URL namespace. */
async function repairPublication(caseSlug: string) {
  const caseRow = await prisma.case.findUnique({
    where: { slug: caseSlug },
    select: { id: true, slug: true },
  });
  if (!caseRow) {
    throw new Error(`Case not found: ${caseSlug}`);
  }

  await recomputeCaseCoverAsset(caseRow.id);
  const publicGroupCount = await prisma.group.count({
    where: { caseId: caseRow.id, isPublic: true },
  });
  if (publicGroupCount > 0) {
    await publishCase(caseRow.id);
  } else {
    await syncCasePublicationState(caseRow.id);
  }

  const activePublicGroups = await prisma.group.findMany({
    where: { caseId: caseRow.id, isPublic: true },
    select: { id: true },
  });
  const scanned = await findStalePublishedBundles(
    caseRow.slug,
    new Set(activePublicGroups.map((group) => group.id)),
  );
  for (const publicSlug of scanned.stalePublicSlugs) {
    await deletePublishedGroup(publicSlug);
  }

  return {
    caseSlug: caseRow.slug,
    activePublicGroupCount: activePublicGroups.length,
    prunedPublicSlugs: scanned.stalePublicSlugs,
    skippedUnidentifiedDirectories: scanned.skippedDirectories,
  };
}

async function main(): Promise<void> {
  const result = await repairPublication(readCaseSlugArgument());
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
