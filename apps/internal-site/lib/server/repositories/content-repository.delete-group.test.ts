import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteGroup } from "./content-repository";

const {
  caseFindUnique,
  caseUpdate,
  groupDelete,
  deletePublishedGroup,
  deleteInternalAssetGroupObjects,
} = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  caseUpdate: vi.fn(),
  groupDelete: vi.fn(),
  deletePublishedGroup: vi.fn(),
  deleteInternalAssetGroupObjects: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    case: {
      findUnique: caseFindUnique,
      update: caseUpdate,
    },
    group: {
      delete: groupDelete,
    },
  },
}));

vi.mock("@/lib/server/storage/published-content", () => ({
  deletePublishedGroup,
}));

vi.mock("@/lib/server/storage/internal-assets", () => ({
  deleteInternalAssetGroupObjects,
}));

describe("deleteGroup", () => {
  beforeEach(() => {
    caseFindUnique.mockReset();
    caseUpdate.mockReset();
    groupDelete.mockReset();
    deletePublishedGroup.mockReset();
    deleteInternalAssetGroupObjects.mockReset();
  });

  it("deletes the group and cleans internal assets", async () => {
    caseFindUnique.mockResolvedValue({
      id: "case-1",
      slug: "2026",
      status: "internal",
      groups: [
        {
          id: "group-1",
          slug: "test-example",
          title: "Test Example",
          isPublic: false,
          publicSlug: null,
        },
      ],
    });

    const result = await deleteGroup("2026", "test-example");

    expect(groupDelete).toHaveBeenCalledWith({
      where: { id: "group-1" },
    });
    expect(deleteInternalAssetGroupObjects).toHaveBeenCalledWith("2026", "test-example");
    expect(deletePublishedGroup).not.toHaveBeenCalled();
    expect(caseUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({
      caseSlug: "2026",
      groupSlug: "test-example",
      groupTitle: "Test Example",
      removedPublishedBundle: false,
      publicSlug: null,
    });
  });

  it("removes published artifacts and downgrades the case when the last public group is deleted", async () => {
    caseFindUnique.mockResolvedValue({
      id: "case-1",
      slug: "2026",
      status: "published",
      groups: [
        {
          id: "group-1",
          slug: "test-example",
          title: "Test Example",
          isPublic: true,
          publicSlug: "2026--test-example",
        },
      ],
    });

    await deleteGroup("2026", "test-example");

    expect(deletePublishedGroup).toHaveBeenCalledWith("2026--test-example");
    expect(caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: {
        status: "internal",
        publishedAt: null,
      },
    });
  });
});
