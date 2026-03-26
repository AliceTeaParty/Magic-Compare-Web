import { prisma } from "@/lib/server/db/client";

/**
 * Recomputes the stored case cover after destructive frame/group mutations so the workspace never
 * points at an asset row that was just deleted by upload replacement or group removal.
 */
export async function recomputeCaseCoverAsset(caseId: string): Promise<void> {
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      groups: {
        include: {
          frames: {
            include: {
              assets: true,
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!caseRow) {
    return;
  }

  let coverAssetId: string | null = null;

  for (const group of caseRow.groups) {
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
