import { prisma } from "@/lib/server/db/client";

/**
 * Recomputes the stored case cover after destructive frame/group mutations so the workspace never
 * points at an asset row that was just deleted by upload replacement or group removal.
 *
 * The query intentionally reads only the ordering and asset flags the cover picker needs, because
 * upload/delete paths call this frequently and SQLite gains nothing from hydrating full frame text
 * and URL payloads when the decision reduces to `id/kind/isPrimaryDisplay`.
 */
export async function recomputeCaseCoverAsset(caseId: string): Promise<void> {
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
    },
  });

  if (!caseRow) {
    return;
  }

  const groups = await prisma.group.findMany({
    where: {
      caseId,
    },
    select: {
      frames: {
        select: {
          assets: {
            select: {
              id: true,
              kind: true,
              isPrimaryDisplay: true,
            },
          },
        },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });

  let coverAssetId: string | null = null;

  for (const group of groups) {
    for (const frame of group.frames) {
      const explicitAfter = frame.assets.find(
        (asset) => asset.kind === "after" && asset.isPrimaryDisplay,
      );
      if (explicitAfter) {
        coverAssetId = explicitAfter.id;
        break;
      }

      const fallback = frame.assets.find((asset) => asset.isPrimaryDisplay);
      if (fallback) {
        coverAssetId = fallback.id;
        break;
      }
    }

    if (coverAssetId) {
      break;
    }
  }

  await prisma.case.update({
    where: { id: caseId },
    data: { coverAssetId },
  });
}

/**
 * A case with zero public groups is not publishable anymore, so destructive upload/reset/delete
 * flows must collapse it back to `internal` and clear stale publication timestamps.
 */
export async function syncCasePublicationState(caseId: string): Promise<void> {
  const remainingPublicGroups = await prisma.group.count({
    where: {
      caseId,
      isPublic: true,
    },
  });

  if (remainingPublicGroups > 0) {
    return;
  }

  await prisma.case.update({
    where: { id: caseId },
    data: {
      status: "internal",
      publishedAt: null,
    },
  });
}
