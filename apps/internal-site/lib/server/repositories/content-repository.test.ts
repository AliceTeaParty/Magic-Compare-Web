import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchCases } from "./content-repository";

const { findMany, shouldHideDemoContent } = vi.hoisted(() => ({
  findMany: vi.fn(),
  shouldHideDemoContent: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    case: {
      findMany,
    },
  },
}));

vi.mock("@/lib/server/runtime-config", () => ({
  shouldHideDemoContent,
  isHiddenDemoCaseSlug: vi.fn(),
}));

describe("searchCases", () => {
  beforeEach(() => {
    findMany.mockReset();
    shouldHideDemoContent.mockReset();
    shouldHideDemoContent.mockReturnValue(false);
  });

  it("returns recent cases when the query is empty", async () => {
    findMany.mockResolvedValue([
      {
        id: "case-1",
        slug: "2026",
        title: "2026",
        subtitle: "",
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

    expect(findMany).toHaveBeenCalledWith({
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
        subtitle: "",
        summary: "ACG quote",
        tags: ["demo"],
        status: "internal",
        publishedAt: null,
        updatedAt: "2026-03-19T08:00:00.000Z",
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
    findMany.mockResolvedValue([]);

    await searchCases("2026", 5);

    expect(findMany).toHaveBeenCalledWith({
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
    findMany.mockResolvedValue([]);

    await searchCases("", 8);

    expect(findMany).toHaveBeenCalledWith({
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
