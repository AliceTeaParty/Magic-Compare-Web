import { Prisma } from "@prisma/client";
import type { ViewerDataset } from "@magic-compare/compare-core/viewer-data";
import { DEMO_CASE_SLUG } from "@magic-compare/shared-utils";
import { prisma } from "@/lib/server/db/client";
import { isHiddenDemoCaseSlug, shouldHideDemoContent } from "@/lib/server/runtime-config";
import {
  buildViewerDataset,
  mapCaseCatalogItem,
  mapCaseSearchResult,
  mapCaseWorkspaceData,
} from "./mappers";
import type { CaseCatalogItem, CaseSearchResult, CaseWorkspaceData } from "./types";

function buildDemoFilter() {
  return {
    slug: {
      not: DEMO_CASE_SLUG,
    },
  } satisfies Prisma.CaseWhereInput;
}

function buildCaseSearchWhere(query: string, hideDemo: boolean): Prisma.CaseWhereInput | undefined {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return hideDemo ? buildDemoFilter() : undefined;
  }

  const searchFilter = {
    OR: [
      {
        slug: {
          contains: normalizedQuery,
        },
      },
      {
        title: {
          contains: normalizedQuery,
        },
      },
    ],
  } satisfies Prisma.CaseWhereInput;

  if (!hideDemo) {
    return searchFilter;
  }

  return {
    AND: [buildDemoFilter(), searchFilter],
  };
}

export async function listCases(): Promise<CaseCatalogItem[]> {
  const cases = await prisma.case.findMany({
    where: shouldHideDemoContent() ? buildDemoFilter() : undefined,
    include: {
      groups: {
        select: {
          isPublic: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return cases.map(mapCaseCatalogItem);
}

export async function searchCases(query: string, limit = 8): Promise<CaseSearchResult[]> {
  const cases = await prisma.case.findMany({
    where: buildCaseSearchWhere(query, shouldHideDemoContent()),
    include: {
      groups: {
        select: {
          slug: true,
          title: true,
          isPublic: true,
          order: true,
        },
        orderBy: {
          order: "asc",
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });

  return cases.map(mapCaseSearchResult);
}

export async function getCaseWorkspace(caseSlug: string): Promise<CaseWorkspaceData | null> {
  if (isHiddenDemoCaseSlug(caseSlug)) {
    return null;
  }

  const caseRow = await prisma.case.findUnique({
    where: { slug: caseSlug },
    include: {
      groups: {
        include: {
          _count: {
            select: {
              frames: true,
            },
          },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  return caseRow ? mapCaseWorkspaceData(caseRow) : null;
}

export async function getViewerDataset(caseSlug: string, groupSlug: string): Promise<ViewerDataset | null> {
  if (isHiddenDemoCaseSlug(caseSlug)) {
    return null;
  }

  const caseRow = await prisma.case.findUnique({
    where: { slug: caseSlug },
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
    return null;
  }

  const currentGroup = caseRow.groups.find((group) => group.slug === groupSlug);
  return currentGroup ? buildViewerDataset(caseRow, currentGroup) : null;
}
