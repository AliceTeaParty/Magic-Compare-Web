import { performance } from "node:perf_hooks";
import { prisma } from "@/lib/server/db/client";
import {
  assertLikelyPublicAssets,
  isKeyCompareAssetKind,
} from "@/lib/server/storage/internal-asset-sanity";
import {
  resetPublishedGroup,
  writePublishedManifest,
} from "@/lib/server/storage/published-content";
import { buildPublishManifest } from "./build-publish-manifest";
import { ensurePublicSlug } from "./resolve-public-slug";

/**
 * Publishes every public group in a case as a fresh manifest snapshot and updates case metadata
 * only after at least one group produced a valid public bundle.
 */
export async function publishCase(caseId: string) {
  const startedAt = performance.now();
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      summary: true,
      tagsJson: true,
      groups: {
        where: { isPublic: true },
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
          frames: {
            where: { isPublic: true },
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
                  storageValidatedAt: true,
                },
              },
            },
            orderBy: {
              order: "asc",
            },
          },
        },
        orderBy: {
          order: "asc",
        },
      },
    },
  });

  if (!caseRow) {
    throw new Error("Case not found.");
  }

  const publishableGroups = caseRow.groups;
  if (publishableGroups.length === 0) {
    throw new Error("No public groups are available for publishing.");
  }

  const queryCompletedAt = performance.now();
  const unvalidatedAssets = publishableGroups.flatMap((group) =>
    group.frames.flatMap((frame) =>
      frame.assets.filter(
        (asset) => asset.storageValidatedAt == null && isKeyCompareAssetKind(asset.kind),
      ),
    ),
  );
  await assertLikelyPublicAssets(unvalidatedAssets);
  const validatedAt = new Date();
  if (unvalidatedAssets.length > 0) {
    await prisma.asset.updateMany({
      where: {
        id: { in: unvalidatedAssets.map((asset) => asset.id) },
        storageValidatedAt: null,
      },
      data: { storageValidatedAt: validatedAt },
    });
    for (const asset of unvalidatedAssets) {
      asset.storageValidatedAt = validatedAt;
    }
  }
  const validationCompletedAt = performance.now();
  const publishedAt = new Date();
  const results: Array<{ groupId: string; publicSlug: string }> = [];

  for (const group of publishableGroups) {
    // Once a group is public we keep its slug stable; only first-time publishes mint one.
    const publicSlug =
      group.publicSlug ?? (await ensurePublicSlug(caseRow.slug, group.slug, group.id));

    if (publicSlug !== group.publicSlug) {
      await prisma.group.update({
        where: { id: group.id },
        data: { publicSlug },
      });
    }

    const manifest = buildPublishManifest({
      caseRow,
      group,
      publicSlug,
      publishedAt,
    });

    if (!manifest) {
      continue;
    }

    // Reset first so removed frames/assets disappear from the published bundle instead of lingering
    // after subsequent publishes.
    await resetPublishedGroup(publicSlug);
    await writePublishedManifest(publicSlug, manifest);
    results.push({ groupId: group.id, publicSlug });
  }

  if (results.length === 0) {
    throw new Error("No publishable groups contain public frames.");
  }

  await prisma.case.update({
    where: { id: caseId },
    data: {
      status: "published",
      publishedAt,
    },
  });

  console.info(
    "[case-publish]",
    JSON.stringify({
      caseId,
      groupCount: results.length,
      frameCount: publishableGroups.reduce((total, group) => total + group.frames.length, 0),
      newlyValidatedAssetCount: unvalidatedAssets.length,
      trustedAssetCount:
        publishableGroups.reduce(
          (total, group) =>
            total +
            group.frames.reduce(
              (frameTotal, frame) =>
                frameTotal +
                frame.assets.filter((asset) => isKeyCompareAssetKind(asset.kind)).length,
              0,
            ),
          0,
        ) - unvalidatedAssets.length,
      queryMs: Math.round(queryCompletedAt - startedAt),
      validationMs: Math.round(validationCompletedAt - queryCompletedAt),
      totalMs: Math.round(performance.now() - startedAt),
    }),
  );

  return {
    publishedAt: publishedAt.toISOString(),
    groups: results,
  };
}
