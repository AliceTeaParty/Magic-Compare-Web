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

/**
 * Centralizes demo hiding so list and search flows cannot drift on whether the sample case should
 * be visible in the current runtime.
 */
function buildDemoFilter() {
  return {
    slug: {
      not: DEMO_CASE_SLUG,
    },
  } satisfies Prisma.CaseWhereInput;
}

/**
 * Keeps the search route consistent with the runtime demo visibility flag so hidden demo content
 * never leaks back in through partial slug/title matches.
 */
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

/**
 * Returns the catalog cards the internal home page needs, with public group counts precomputed
 * server-side so the UI does not learn about Prisma shapes.
 */
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

/**
 * Drives the internal search palette and intentionally omits deprecated `subtitle` propagation so
 * the app layer can stop depending on legacy fields while schema compatibility remains elsewhere.
 */
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

/**
 * Hides demo workspace state behind the same runtime gate used elsewhere so the internal site does
 * not accidentally expose hidden sample content through direct links.
 */
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

/**
 * Loads the full viewer payload for the internal route and rejects hidden demo slugs early so the
 * caller gets a clean `null` instead of learning about filtered data through group lookups.
 */
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
