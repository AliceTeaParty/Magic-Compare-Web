import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteCase, deleteGroup } from "./content-repository";

const {
  caseFindUnique,
  caseDelete,
  groupDelete,
  deletePublishedGroup,
  deleteInternalAssetPrefix,
  recomputeCaseCoverAsset,
  syncCasePublicationState,
} = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  caseDelete: vi.fn(),
  groupDelete: vi.fn(),
  deletePublishedGroup: vi.fn(),
  deleteInternalAssetPrefix: vi.fn(),
  recomputeCaseCoverAsset: vi.fn(),
  syncCasePublicationState: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    case: {
      findUnique: caseFindUnique,
      delete: caseDelete,
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
  deleteInternalAssetPrefix,
}));

vi.mock("@/lib/server/content/case-maintenance", () => ({
  recomputeCaseCoverAsset,
  syncCasePublicationState,
}));

describe("deleteGroup", () => {
  beforeEach(() => {
    caseFindUnique.mockReset();
    caseDelete.mockReset();
    groupDelete.mockReset();
    deletePublishedGroup.mockReset();
    deleteInternalAssetPrefix.mockReset();
    recomputeCaseCoverAsset.mockReset();
    syncCasePublicationState.mockReset();
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
          storageRoot: "/groups/group-1",
        },
      ],
    });

    const result = await deleteGroup("2026", "test-example");

    expect(groupDelete).toHaveBeenCalledWith({
      where: { id: "group-1" },
    });
    expect(deleteInternalAssetPrefix).toHaveBeenCalledWith("/groups/group-1");
    expect(deletePublishedGroup).not.toHaveBeenCalled();
    expect(recomputeCaseCoverAsset).toHaveBeenCalledWith("case-1");
    expect(syncCasePublicationState).toHaveBeenCalledWith("case-1");
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
          storageRoot: "/groups/group-1",
        },
      ],
    });

    await deleteGroup("2026", "test-example");

    expect(deletePublishedGroup).toHaveBeenCalledWith("2026--test-example");
    expect(syncCasePublicationState).toHaveBeenCalledWith("case-1");
  });
});

describe("deleteCase", () => {
  beforeEach(() => {
    caseFindUnique.mockReset();
    caseDelete.mockReset();
  });

  it("deletes an empty case", async () => {
    caseFindUnique.mockResolvedValue({
      id: "case-1",
      slug: "2026",
      groups: [],
    });

    const result = await deleteCase("2026");

    expect(caseDelete).toHaveBeenCalledWith({
      where: { id: "case-1" },
    });
    expect(result).toEqual({
      caseSlug: "2026",
      deleted: true,
    });
  });

  it("rejects non-empty cases", async () => {
    caseFindUnique.mockResolvedValue({
      id: "case-1",
      slug: "2026",
      groups: [{ id: "group-1" }],
    });

    await expect(deleteCase("2026")).rejects.toThrow(
      "Case must be empty before deletion.",
    );
    expect(caseDelete).not.toHaveBeenCalled();
  });
});
