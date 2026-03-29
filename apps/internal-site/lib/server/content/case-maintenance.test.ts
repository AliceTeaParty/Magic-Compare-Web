import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recomputeCaseCoverAsset,
  syncCasePublicationState,
} from "./case-maintenance";

const {
  caseFindUnique,
  caseUpdate,
  groupFindMany,
  groupCount,
} = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  caseUpdate: vi.fn(),
  groupFindMany: vi.fn(),
  groupCount: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    case: {
      findUnique: caseFindUnique,
      update: caseUpdate,
    },
    group: {
      findMany: groupFindMany,
      count: groupCount,
    },
  },
}));

describe("case-maintenance", () => {
  beforeEach(() => {
    caseFindUnique.mockReset();
    caseUpdate.mockReset();
    groupFindMany.mockReset();
    groupCount.mockReset();
  });

  it("recomputes cover with a narrow ordering-and-flags query", async () => {
    caseFindUnique.mockResolvedValue({ id: "case-1" });
    groupFindMany.mockResolvedValue([
      {
        frames: [
          {
            assets: [
              {
                id: "asset-before",
                kind: "before",
                isPrimaryDisplay: true,
              },
              {
                id: "asset-after",
                kind: "after",
                isPrimaryDisplay: true,
              },
            ],
          },
        ],
      },
    ]);

    await recomputeCaseCoverAsset("case-1");

    expect(caseFindUnique).toHaveBeenCalledWith({
      where: { id: "case-1" },
      select: {
        id: true,
      },
    });
    expect(groupFindMany).toHaveBeenCalledWith({
      where: {
        caseId: "case-1",
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
    expect(caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: { coverAssetId: "asset-after" },
    });
  });

  it("falls back to the first primary-display asset when no primary after exists", async () => {
    caseFindUnique.mockResolvedValue({ id: "case-1" });
    groupFindMany.mockResolvedValue([
      {
        frames: [
          {
            assets: [
              {
                id: "asset-primary",
                kind: "misc",
                isPrimaryDisplay: true,
              },
            ],
          },
        ],
      },
    ]);

    await recomputeCaseCoverAsset("case-1");

    expect(caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: { coverAssetId: "asset-primary" },
    });
  });

  it("keeps a published case published when public groups remain", async () => {
    groupCount.mockResolvedValue(1);

    await syncCasePublicationState("case-1");

    expect(groupCount).toHaveBeenCalledWith({
      where: {
        caseId: "case-1",
        isPublic: true,
      },
    });
    expect(caseUpdate).not.toHaveBeenCalled();
  });

  it("downgrades a case when the last public group disappears", async () => {
    groupCount.mockResolvedValue(0);

    await syncCasePublicationState("case-1");

    expect(caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: {
        status: "internal",
        publishedAt: null,
      },
    });
  });
});
