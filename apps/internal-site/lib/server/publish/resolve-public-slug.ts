import { randomUUID } from "node:crypto";
import { buildPublicGroupSlug } from "@magic-compare/shared-utils";
import { prisma } from "@/lib/server/db/client";

/**
 * Keeps published URLs stable when possible but falls back to a short random suffix when another
 * group already owns the human-readable slug candidate.
 */
export async function ensurePublicSlug(
  caseSlug: string,
  groupSlug: string,
  groupId: string,
): Promise<string> {
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

    // A short suffix keeps collision recovery readable without requiring unbounded numeric probing.
    candidate = `${baseSlug}-${randomUUID().slice(0, 6)}`;
  }
}
