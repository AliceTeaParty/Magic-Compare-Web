import { randomUUID } from "node:crypto";
import { buildPublicGroupSlug } from "@magic-compare/shared-utils";
import { prisma } from "@/lib/server/db/client";

export async function ensurePublicSlug(caseSlug: string, groupSlug: string, groupId: string): Promise<string> {
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
