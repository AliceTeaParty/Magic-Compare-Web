import { beforeEach, describe, expect, it, vi } from "vitest";
import { listCases } from "./content-repository";

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
