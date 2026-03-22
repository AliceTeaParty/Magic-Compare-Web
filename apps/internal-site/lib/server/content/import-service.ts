import type { ImportManifest } from "@magic-compare/content-schema";
import { validateImportManifest } from "@/lib/server/validators/import-manifest";
import { prisma } from "@/lib/server/db/client";
import { assertLikelyImportManifestAssets } from "@/lib/server/storage/internal-asset-sanity";
import { stringifyTags } from "./mappers";

/**
 * Reuses the group row when an import is repeated so stable slugs/public settings survive, but
 * replaces frames/assets wholesale because the uploader manifest is the source of truth.
 */
export async function upsertGroup(groupEntry: ImportManifest["groups"][number], caseId: string) {
  const existingGroup = await prisma.group.findUnique({
    where: {
      caseId_slug: {
        caseId,
        slug: groupEntry.group.slug,
      },
    },
  });

  if (!existingGroup) {
    return prisma.group.create({
      data: {
        caseId,
        slug: groupEntry.group.slug,
        title: groupEntry.group.title,
        description: groupEntry.group.description,
        order: groupEntry.group.order,
        defaultMode: groupEntry.group.defaultMode,
        isPublic: groupEntry.group.isPublic,
        tagsJson: stringifyTags(groupEntry.group.tags),
      },
    });
  }

  await prisma.asset.deleteMany({
    where: {
      frame: {
        groupId: existingGroup.id,
      },
    },
  });
  await prisma.frame.deleteMany({
    where: {
      groupId: existingGroup.id,
    },
  });

  return prisma.group.update({
    where: { id: existingGroup.id },
    data: {
      title: groupEntry.group.title,
      description: groupEntry.group.description,
      order: groupEntry.group.order,
      defaultMode: groupEntry.group.defaultMode,
      isPublic: groupEntry.group.isPublic,
      tagsJson: stringifyTags(groupEntry.group.tags),
    },
  });
}

/**
 * Applies the uploader manifest as an authoritative snapshot and keeps deprecated case fields like
 * `subtitle` populated for schema/publish compatibility even though the internal app no longer uses them.
 */
export async function applyImportManifest(rawManifest: unknown) {
  const manifest = validateImportManifest(rawManifest);
  await assertLikelyImportManifestAssets(manifest);

  const caseRow = await prisma.case.upsert({
    where: {
      slug: manifest.case.slug,
    },
    update: {
      title: manifest.case.title,
      subtitle: manifest.case.subtitle || "",
      summary: manifest.case.summary,
      status: manifest.case.status,
      tagsJson: stringifyTags(manifest.case.tags),
    },
    create: {
      slug: manifest.case.slug,
      title: manifest.case.title,
      subtitle: manifest.case.subtitle || "",
      summary: manifest.case.summary,
      status: manifest.case.status,
      tagsJson: stringifyTags(manifest.case.tags),
    },
  });

  let coverAssetId: string | null = null;

  for (const groupEntry of manifest.groups) {
    const groupRow = await upsertGroup(groupEntry, caseRow.id);

    for (const frameEntry of groupEntry.frames) {
      const frameRow = await prisma.frame.create({
        data: {
          groupId: groupRow.id,
          title: frameEntry.frame.title,
          caption: frameEntry.frame.caption,
          order: frameEntry.frame.order,
          isPublic: frameEntry.frame.isPublic,
        },
      });

      for (const assetEntry of frameEntry.assets) {
        const assetRow = await prisma.asset.create({
          data: {
            frameId: frameRow.id,
            kind: assetEntry.kind,
            label: assetEntry.label,
            imageUrl: assetEntry.imageUrl,
            thumbUrl: assetEntry.thumbUrl,
            width: assetEntry.width,
            height: assetEntry.height,
            note: assetEntry.note,
            isPublic: assetEntry.isPublic,
            isPrimaryDisplay: assetEntry.isPrimaryDisplay,
          },
        });

        // Prefer an explicit manifest label so uploader-defined covers remain stable even if the
        // primary display heuristics later change.
        if (
          !coverAssetId &&
          manifest.case.coverAssetLabel &&
          assetEntry.label === manifest.case.coverAssetLabel
        ) {
          coverAssetId = assetRow.id;
        }

        // Fall back to the primary after frame because that is the least surprising cover when the
        // manifest omitted an explicit label.
        if (!coverAssetId && assetEntry.kind === "after" && assetEntry.isPrimaryDisplay) {
          coverAssetId = assetRow.id;
        }
      }
    }
  }

  await prisma.case.update({
    where: { id: caseRow.id },
    data: {
      coverAssetId,
    },
  });

  return {
    caseId: caseRow.id,
    slug: caseRow.slug,
    importedGroups: manifest.groups.length,
  };
}
