import { beforeEach, describe, expect, it, vi } from "vitest";
import { listCases, searchCases } from "./content-repository";

const { assetFindMany, caseFindMany, shouldHideDemoContent } = vi.hoisted(() => ({
  assetFindMany: vi.fn(),
  caseFindMany: vi.fn(),
  shouldHideDemoContent: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    case: {
      findMany: caseFindMany,
    },
    asset: {
      findMany: assetFindMany,
    },
  },
}));

vi.mock("@/lib/server/storage/internal-assets", () => ({
  resolvePublicInternalAssetUrl: (logicalPath: string) => `https://assets.test/${logicalPath}`,
}));

vi.mock("@/lib/server/runtime-config", () => ({
  shouldHideDemoContent,
  isHiddenDemoCaseSlug: vi.fn(),
}));

describe("searchCases", () => {
  beforeEach(() => {
    assetFindMany.mockReset();
    caseFindMany.mockReset();
    shouldHideDemoContent.mockReset();
    shouldHideDemoContent.mockReturnValue(false);
  });

  it("returns recent cases when the query is empty", async () => {
    caseFindMany.mockResolvedValue([
      {
        id: "case-1",
        slug: "2026",
        title: "2026",
        summary: "ACG quote",
        tagsJson: JSON.stringify(["demo"]),
        status: "internal",
        publishedAt: null,
        updatedAt: new Date("2026-03-19T08:00:00.000Z"),
        groups: [
          {
            slug: "group-b",
            title: "Group B",
            isPublic: false,
            order: 1,
          },
          {
            slug: "group-a",
            title: "Group A",
            isPublic: true,
            order: 0,
          },
        ],
      },
    ]);

    const results = await searchCases("");

    expect(caseFindMany).toHaveBeenCalledWith({
      where: undefined,
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
      take: 8,
    });
    expect(results).toEqual([
      {
        id: "case-1",
        slug: "2026",
        title: "2026",
        summary: "ACG quote",
        tags: ["demo"],
        status: "internal",
        publishedAt: null,
        updatedAt: "2026-03-19T08:00:00.000Z",
        coverThumbUrl: null,
        groupCount: 2,
        publicGroupCount: 1,
        groups: [
          {
            slug: "group-a",
            title: "Group A",
          },
          {
            slug: "group-b",
            title: "Group B",
          },
        ],
      },
    ]);
  });

  it("searches slug and title with the provided limit", async () => {
    caseFindMany.mockResolvedValue([]);

    await searchCases("2026", 5);

    expect(caseFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            slug: {
              contains: "2026",
            },
          },
          {
            title: {
              contains: "2026",
            },
          },
        ],
      },
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
      take: 5,
    });
  });

  it("filters the fixed demo case when the env flag is enabled", async () => {
    shouldHideDemoContent.mockReturnValue(true);
    caseFindMany.mockResolvedValue([]);

    await searchCases("", 8);

    expect(caseFindMany).toHaveBeenCalledWith({
      where: {
        slug: {
          not: "demo-grain-study",
        },
      },
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
      take: 8,
    });
  });
});

describe("listCases", () => {
  beforeEach(() => {
    assetFindMany.mockReset();
    caseFindMany.mockReset();
    shouldHideDemoContent.mockReset();
    shouldHideDemoContent.mockReturnValue(false);
  });

  it("adds the selected cover thumbnail without loading frame trees", async () => {
    caseFindMany.mockResolvedValue([
      {
        id: "case-1",
        slug: "2026",
        title: "2026",
        summary: "ACG quote",
        tagsJson: "[]",
        status: "internal",
        coverAssetId: "asset-cover",
        publishedAt: null,
        updatedAt: new Date("2026-03-19T08:00:00.000Z"),
        groups: [{ isPublic: true }],
      },
    ]);
    assetFindMany.mockResolvedValue([
      { id: "asset-cover", thumbUrl: "groups/2026/main/thumb.webp" },
    ]);

    const results = await listCases();

    expect(assetFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["asset-cover"] } },
      select: { id: true, thumbUrl: true },
    });
    expect(results[0]?.coverThumbUrl).toBe("https://assets.test/groups/2026/main/thumb.webp");
  });
});
