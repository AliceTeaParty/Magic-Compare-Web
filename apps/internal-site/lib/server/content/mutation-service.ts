import { prisma } from "@/lib/server/db/client";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/server/api/errors";
import { publishCase } from "@/lib/server/publish/publish-case";
import { deletePublishedGroup } from "@/lib/server/storage/published-content";
import { deleteInternalAssetPrefix } from "@/lib/server/storage/internal-assets";
import { recomputeCaseCoverAsset, syncCasePublicationState } from "./case-maintenance";

/** The database commit is final; report failed derived work without telling clients to roll it back. */
async function afterCommit(context: string, warning: string, action: () => Promise<unknown>) {
  try {
    await action();
    return {};
  } catch (error) {
    console.error(`[content-mutation] ${context}`, error);
    return { warnings: [warning] };
  }
}

const PUBLICATION_WARNING = "更改已保存，公开内容同步失败。请联系管理员修复公开内容。";

/** Refreshes existing public content while leaving draft-only cases untouched. */
async function refreshPublishedCase(caseId: string): Promise<boolean> {
  const publicGroupCount = await prisma.group.count({
    where: { caseId, isPublic: true },
  });
  if (publicGroupCount === 0) return false;

  await publishCase(caseId);
  return true;
}

/**
 * Centralizes the "case must exist before mutating one of its groups" guard so write paths fail
 * with the same message instead of each route inventing its own not-found handling.
 */
async function requireCaseWithGroups(
  caseSlug: string,
  select: {
    id: true;
    slug: true;
    title?: true;
    isPublic?: true;
    publicSlug?: true;
  },
): Promise<{
  id: string;
  slug: string;
  status?: string;
  groups: Array<{
    id: string;
    slug: string;
    title?: string;
    isPublic?: boolean;
    publicSlug?: string | null;
  }>;
}> {
  const caseRow = await prisma.case.findUnique({
    where: { slug: caseSlug },
    include: {
      groups: {
        select,
      },
    },
  });

  if (!caseRow) {
    throw new NotFoundError("项目不存在。");
  }

  return caseRow;
}

/**
 * Keeps group lookup errors uniform across reorder/visibility/delete flows so API responses stay
 * predictable when the client works on stale workspace state.
 */
function requireTargetGroup<T extends { slug: string }>(groups: T[], groupSlug: string): T {
  const targetGroup = groups.find((group) => group.slug === groupSlug);

  if (!targetGroup) {
    throw new NotFoundError("图组不存在。");
  }

  return targetGroup;
}

/**
 * Creates an empty internal workspace case only. Upload, publish, and public export remain explicit
 * follow-up actions so a new case cannot accidentally appear on the public site.
 */
export async function createCase(metadata: { slug: string; title: string; summary?: string }) {
  const slug = metadata.slug.trim();
  const title = metadata.title.trim();
  const summary = metadata.summary?.trim() ?? "";

  if (!title) {
    throw new BadRequestError("项目标题不能为空。");
  }

  const existingCase = await prisma.case.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (existingCase) {
    throw new ConflictError("项目已存在。");
  }

  const caseRow = await prisma.case.create({
    data: {
      slug,
      title,
      summary,
      subtitle: "",
      tagsJson: "[]",
      status: "draft",
    },
    select: {
      slug: true,
      title: true,
      summary: true,
      status: true,
    },
  });

  return {
    caseSlug: caseRow.slug,
    title: caseRow.title,
    summary: caseRow.summary,
    status: caseRow.status,
  };
}

/**
 * Rejects stale drag-and-drop state before writing because partial or foreign id lists would leave
 * duplicate order values and publish a manifest that no longer matches the workspace.
 */
export async function reorderGroups(caseId: string, groupIds: string[]) {
  const currentGroups = await prisma.group.findMany({
    where: { caseId },
    select: { id: true },
  });
  const requestedGroupIds = new Set(groupIds);
  if (
    groupIds.length === 0 ||
    requestedGroupIds.size !== groupIds.length ||
    currentGroups.length !== groupIds.length ||
    currentGroups.some((group) => !requestedGroupIds.has(group.id))
  ) {
    throw new ConflictError("图组顺序已过期，请刷新项目后重试。");
  }

  await prisma.$transaction(
    groupIds.map((groupId, order) =>
      prisma.group.updateMany({
        where: {
          id: groupId,
          caseId,
        },
        data: { order },
      }),
    ),
  );
  return afterCommit(`reorder ${caseId}`, PUBLICATION_WARNING, () => refreshPublishedCase(caseId));
}

/**
 * Toggles a group's public eligibility and synchronizes the published bundle before returning.
 */
export async function setGroupVisibility(caseSlug: string, groupSlug: string, isPublic: boolean) {
  const caseRow = await requireCaseWithGroups(caseSlug, {
    id: true,
    slug: true,
    title: true,
    isPublic: true,
    publicSlug: true,
  });
  const targetGroup = requireTargetGroup(caseRow.groups, groupSlug);

  await prisma.group.update({
    where: { id: targetGroup.id },
    data: {
      isPublic,
    },
  });

  const warnings: string[] = [];
  if (!isPublic && targetGroup.publicSlug) {
    const cleanup = await afterCommit(
      `hide published ${targetGroup.publicSlug}`,
      "可见性已保存，但公开内容清理失败。请联系管理员修复公开内容。",
      () => deletePublishedGroup(targetGroup.publicSlug!),
    );
    warnings.push(...(cleanup.warnings ?? []));
  }
  // A failed filesystem cleanup must not skip the database's derived publication state.
  const synchronization = await afterCommit(
    `visibility ${caseSlug}/${groupSlug}`,
    PUBLICATION_WARNING,
    async () => {
      if (!(await refreshPublishedCase(caseRow.id))) {
        await syncCasePublicationState(caseRow.id);
      }
    },
  );
  warnings.push(...(synchronization.warnings ?? []));

  return {
    caseSlug: caseRow.slug,
    groupSlug: targetGroup.slug,
    isPublic,
    ...(warnings.length ? { warnings } : {}),
  };
}

/**
 * Updates the workspace-facing case description and refreshes existing public manifests.
 */
export async function updateCaseSummary(caseSlug: string, summary: string) {
  const trimmedSummary = summary.trim();
  const caseRow = await prisma.case.update({
    where: { slug: caseSlug },
    data: { summary: trimmedSummary },
    select: {
      id: true,
      slug: true,
      summary: true,
    },
  });
  const synchronization = await afterCommit(`metadata ${caseSlug}`, PUBLICATION_WARNING, () =>
    refreshPublishedCase(caseRow.id),
  );

  return {
    caseSlug: caseRow.slug,
    summary: caseRow.summary,
    ...synchronization,
  };
}

/** Updates operator-managed Case metadata and refreshes existing public manifests. */
export async function updateCaseMetadata(
  caseSlug: string,
  metadata: { title?: string; summary?: string; tags?: string[] },
) {
  const data: { title?: string; summary?: string; tagsJson?: string } = {};

  if (metadata.title !== undefined) {
    const title = metadata.title.trim();
    if (!title) throw new BadRequestError("项目标题不能为空。");
    data.title = title;
  }
  if (metadata.summary !== undefined) data.summary = metadata.summary.trim();
  if (metadata.tags !== undefined) {
    const tags = [...new Set(metadata.tags.map((tag) => tag.trim()).filter(Boolean))];
    data.tagsJson = JSON.stringify(tags);
  }
  if (Object.keys(data).length === 0) {
    throw new BadRequestError("没有可更新的项目元数据。");
  }

  const existingCase = await prisma.case.findUnique({
    where: { slug: caseSlug },
    select: { id: true },
  });
  if (!existingCase) {
    throw new NotFoundError("项目不存在。");
  }

  const caseRow = await prisma.case.update({
    where: { id: existingCase.id },
    data,
    select: { id: true, slug: true, title: true, summary: true, tagsJson: true, status: true },
  });
  const synchronization = await afterCommit(`metadata ${caseSlug}`, PUBLICATION_WARNING, () =>
    refreshPublishedCase(caseRow.id),
  );

  return {
    caseSlug: caseRow.slug,
    title: caseRow.title,
    summary: caseRow.summary,
    tags: JSON.parse(caseRow.tagsJson) as string[],
    status: caseRow.status,
    ...synchronization,
  };
}

/**
 * Updates group display metadata after resolving the group through its case, preserving slugs and
 * all publish/upload fields so existing viewer and public URLs remain stable.
 */
export async function updateGroupMetadata(
  caseSlug: string,
  groupSlug: string,
  metadata: { title: string; description: string },
) {
  const title = metadata.title.trim();
  const description = metadata.description.trim();

  if (!title) {
    throw new BadRequestError("图组标题不能为空。");
  }

  const caseRow = await requireCaseWithGroups(caseSlug, {
    id: true,
    slug: true,
    isPublic: true,
  });
  const targetGroup = requireTargetGroup(caseRow.groups, groupSlug);
  const groupRow = await prisma.group.update({
    where: { id: targetGroup.id },
    data: {
      title,
      description,
    },
    select: {
      slug: true,
      title: true,
      description: true,
    },
  });

  const synchronization = await afterCommit(
    `metadata ${caseSlug}/${groupSlug}`,
    PUBLICATION_WARNING,
    async () => {
      if (targetGroup.isPublic) await publishCase(caseRow.id);
    },
  );

  return {
    caseSlug: caseRow.slug,
    groupSlug: groupRow.slug,
    title: groupRow.title,
    description: groupRow.description,
    ...synchronization,
  };
}

/**
 * Deletes the group from both internal storage and published output, and downgrades the case back
 * to `internal` when that deletion removed the last public group.
 */
export async function deleteGroup(caseSlug: string, groupSlug: string) {
  const caseRow = await prisma.case.findUnique({
    where: { slug: caseSlug },
    include: {
      groups: {
        select: {
          id: true,
          slug: true,
          title: true,
          isPublic: true,
          publicSlug: true,
          storageRoot: true,
        },
      },
    },
  });

  if (!caseRow) {
    throw new NotFoundError("项目不存在。");
  }

  const targetGroup = requireTargetGroup(caseRow.groups, groupSlug);

  await prisma.group.delete({
    where: { id: targetGroup.id },
  });

  const warnings: string[] = [];
  if (targetGroup.storageRoot) {
    const cleanup = await afterCommit(
      `delete assets ${targetGroup.storageRoot}`,
      "图组已删除，但素材清理失败。请联系管理员清理残留素材。",
      () => deleteInternalAssetPrefix(targetGroup.storageRoot!),
    );
    warnings.push(...(cleanup.warnings ?? []));
  }

  let removedPublishedBundle = false;
  if (targetGroup.publicSlug) {
    const cleanup = await afterCommit(
      `delete published ${targetGroup.publicSlug}`,
      "图组已删除，但公开内容清理失败。请联系管理员修复公开内容。",
      async () => {
        await deletePublishedGroup(targetGroup.publicSlug!);
        removedPublishedBundle = true;
      },
    );
    warnings.push(...(cleanup.warnings ?? []));
  }

  const maintenance = await afterCommit(
    `delete metadata ${caseSlug}/${groupSlug}`,
    "图组已删除，但项目状态更新失败。请联系管理员修复项目状态。",
    async () => {
      await recomputeCaseCoverAsset(caseRow.id);
      await syncCasePublicationState(caseRow.id);
    },
  );
  warnings.push(...(maintenance.warnings ?? []));

  return {
    caseSlug: caseRow.slug,
    groupSlug: targetGroup.slug,
    groupTitle: targetGroup.title,
    removedPublishedBundle,
    ...(warnings.length ? { warnings } : {}),
    publicSlug: targetGroup.publicSlug,
  };
}

/**
 * Case deletion is intentionally shallow and only allowed for empty cases so operators cannot
 * trigger recursive object-store cleanup through one overly broad API call.
 */
export async function deleteCase(caseSlug: string) {
  const caseRow = await prisma.case.findUnique({
    where: { slug: caseSlug },
    include: {
      groups: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!caseRow) {
    throw new NotFoundError("项目不存在。");
  }

  if (caseRow.groups.length > 0) {
    throw new ConflictError("删除项目前必须先清空全部图组。");
  }

  await prisma.case.delete({
    where: { id: caseRow.id },
  });

  return {
    caseSlug: caseRow.slug,
    deleted: true,
  };
}
