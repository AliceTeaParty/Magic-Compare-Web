import { performance } from "node:perf_hooks";
import { prisma } from "@/lib/server/db/client";
import {
  assertLikelyPublicAssets,
  isKeyCompareAssetKind,
} from "@/lib/server/storage/internal-asset-sanity";
import {
  readPublishedManifest,
  writePublishedManifest,
} from "@/lib/server/storage/published-content";
import { buildPublishManifest } from "./build-publish-manifest";
import {
  enrichPublishManifestWithPlaceholders,
  type PublishPlaceholderStats,
} from "./publish-image-placeholders";
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
                  imagePlaceholderJson: true,
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
    throw new Error("项目不存在。");
  }

  const publishableGroups = caseRow.groups;
  if (publishableGroups.length === 0) {
    throw new Error("没有可发布的公开图组。");
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
  const placeholderStats: PublishPlaceholderStats = { generated: 0, reused: 0, failed: 0 };

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

    const baseManifest = buildPublishManifest({
      caseRow,
      group,
      publicSlug,
      publishedAt,
    });

    if (!baseManifest) {
      continue;
    }

    const previousManifest = await readPublishedManifest(publicSlug);
    const enriched = await enrichPublishManifestWithPlaceholders({
      manifest: baseManifest,
      previousManifest,
      sourceAssets: group.frames.flatMap((frame) => frame.assets),
    });
    placeholderStats.generated += enriched.stats.generated;
    placeholderStats.reused += enriched.stats.reused;
    placeholderStats.failed += enriched.stats.failed;

    if (enriched.stats.failed > 0) {
      // Placeholders improve slow-network feedback but are not inspection assets. Publish valid
      // originals and report only an aggregate so one damaged thumbnail cannot block the group.
      console.warn(
        "[case-publish-placeholders]",
        JSON.stringify({ publicSlug, failedAssetCount: enriched.stats.failed }),
      );
    }

    await writePublishedManifest(publicSlug, enriched.manifest);
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
      placeholderGeneratedCount: placeholderStats.generated,
      placeholderReusedCount: placeholderStats.reused,
      placeholderFailedCount: placeholderStats.failed,
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
