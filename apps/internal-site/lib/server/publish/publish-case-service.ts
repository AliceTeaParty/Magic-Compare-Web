import { prisma } from "@/lib/server/db/client";
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
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      groups: {
        include: {
          frames: {
            include: {
              assets: true,
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

  const publishableGroups = caseRow.groups.filter((group) => group.isPublic);
  if (publishableGroups.length === 0) {
    throw new Error("No public groups are available for publishing.");
  }

  const publishedAt = new Date();
  const results: Array<{ groupId: string; publicSlug: string }> = [];

  for (const group of publishableGroups) {
    // Once a group is public we keep its slug stable; only first-time publishes mint one.
    const publicSlug = group.publicSlug ?? (await ensurePublicSlug(caseRow.slug, group.slug, group.id));

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

  return {
    publishedAt: publishedAt.toISOString(),
    groups: results,
  };
}
