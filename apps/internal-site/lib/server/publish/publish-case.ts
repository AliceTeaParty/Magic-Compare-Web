import path from "node:path";
import { randomUUID } from "node:crypto";
import { PUBLISH_SCHEMA_VERSION, type PublishManifest } from "@magic-compare/content-schema";
import { buildPublicGroupSlug } from "@magic-compare/shared-utils";
import { prisma } from "@/lib/server/db/client";
import {
  copyInternalAssetToPublished,
  resetPublishedGroup,
  writePublishedManifest,
} from "@/lib/server/storage/published-content";

function withFileExtension(url: string, fallback: string): string {
  const extension = path.extname(url);
  return extension || fallback;
}

async function ensurePublicSlug(caseSlug: string, groupSlug: string, groupId: string): Promise<string> {
  const baseSlug = buildPublicGroupSlug(caseSlug, groupSlug);
  let candidate = baseSlug;

  while (true) {
    const existing = await prisma.group.findFirst({
      where: {
        publicSlug: candidate,
        NOT: {
          id: groupId,
        },
      },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    candidate = `${baseSlug}-${randomUUID().slice(0, 6)}`;
  }
}

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
    const publicSlug = group.publicSlug ?? (await ensurePublicSlug(caseRow.slug, group.slug, group.id));
    if (publicSlug !== group.publicSlug) {
      await prisma.group.update({
        where: { id: group.id },
        data: { publicSlug },
      });
    }

    const publicFrames = group.frames.filter((frame) => frame.isPublic);
    if (publicFrames.length === 0) {
      continue;
    }

    await resetPublishedGroup(publicSlug);

    const manifestFrames = [];

    for (const frame of publicFrames) {
      const publicAssets = frame.assets.filter((asset) => asset.isPublic);
      const beforeAsset = publicAssets.find((asset) => asset.kind === "before");
      const afterAsset = publicAssets.find((asset) => asset.kind === "after");

      if (!beforeAsset || !afterAsset) {
        throw new Error(`Frame "${frame.title}" is missing a before/after asset pair.`);
      }

      const manifestAssets = [];
      for (const asset of publicAssets) {
        const extension = withFileExtension(asset.imageUrl, ".bin");
        const thumbExtension = withFileExtension(asset.thumbUrl, extension);
        const imageFileName = `${String(frame.order).padStart(3, "0")}-${asset.kind}-${asset.id}${extension}`;
        const thumbFileName = `${String(frame.order).padStart(3, "0")}-${asset.kind}-${asset.id}-thumb${thumbExtension}`;

        await copyInternalAssetToPublished(asset.imageUrl, publicSlug, imageFileName);
        await copyInternalAssetToPublished(asset.thumbUrl, publicSlug, thumbFileName);

        manifestAssets.push({
          id: asset.id,
          kind: asset.kind as "before" | "after" | "heatmap" | "crop" | "misc",
          label: asset.label,
          imageUrl: `/published/groups/${publicSlug}/assets/${imageFileName}`,
          thumbUrl: `/published/groups/${publicSlug}/assets/${thumbFileName}`,
          width: asset.width,
          height: asset.height,
          note: asset.note,
          isPrimaryDisplay: asset.isPrimaryDisplay,
        });
      }

      manifestFrames.push({
        id: frame.id,
        title: frame.title,
        caption: frame.caption,
        order: frame.order,
        assets: manifestAssets,
      });
    }

    const manifest: PublishManifest = {
      schemaVersion: PUBLISH_SCHEMA_VERSION,
      publicSlug,
      generatedAt: publishedAt.toISOString(),
      assetBasePath: `/published/groups/${publicSlug}/assets`,
      case: {
        slug: caseRow.slug,
        title: caseRow.title,
        subtitle: caseRow.subtitle,
        summary: caseRow.summary,
        tags: JSON.parse(caseRow.tagsJson),
        publishedAt: publishedAt.toISOString(),
      },
      group: {
        id: group.id,
        slug: group.slug,
        publicSlug,
        title: group.title,
        description: group.description,
        defaultMode:
          group.defaultMode === "a-b" || group.defaultMode === "heatmap"
            ? group.defaultMode
            : "before-after",
        tags: JSON.parse(group.tagsJson),
      },
      frames: manifestFrames,
    };

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
