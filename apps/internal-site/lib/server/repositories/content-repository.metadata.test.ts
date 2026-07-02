import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCase, updateCaseSummary, updateGroupMetadata } from "./content-repository";

const { caseCreate, caseUpdate, caseFindUnique, groupUpdate } = vi.hoisted(() => ({
  caseCreate: vi.fn(),
  caseUpdate: vi.fn(),
  caseFindUnique: vi.fn(),
  groupUpdate: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    case: {
      create: caseCreate,
      findUnique: caseFindUnique,
      update: caseUpdate,
    },
    group: {
      update: groupUpdate,
    },
  },
}));

describe("createCase", () => {
  beforeEach(() => {
    caseCreate.mockReset();
    caseFindUnique.mockReset();
  });

  it("creates an empty draft case without publishing side effects", async () => {
    caseFindUnique.mockResolvedValue(null);
    caseCreate.mockResolvedValue({
      slug: "new-case",
      title: "New Case",
      summary: "Draft summary",
      status: "draft",
    });

    const result = await createCase({
      slug: "new-case",
      title: " New Case ",
      summary: " Draft summary ",
    });

    expect(caseCreate).toHaveBeenCalledWith({
      data: {
        slug: "new-case",
        title: "New Case",
        summary: "Draft summary",
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
    expect(result).toEqual({
      caseSlug: "new-case",
      title: "New Case",
      summary: "Draft summary",
      status: "draft",
    });
  });

  it("rejects duplicate case slugs before writing", async () => {
    caseFindUnique.mockResolvedValue({ id: "case-1" });

    await expect(createCase({ slug: "mono", title: "mono", summary: "" })).rejects.toThrow(
      "Case already exists.",
    );
    expect(caseCreate).not.toHaveBeenCalled();
  });
});

describe("updateCaseSummary", () => {
  beforeEach(() => {
    caseUpdate.mockReset();
  });

  it("trims and writes the case summary field", async () => {
    caseUpdate.mockResolvedValue({
      slug: "mono",
      summary: "Updated summary",
    });

    const result = await updateCaseSummary("mono", " Updated summary ");

    expect(caseUpdate).toHaveBeenCalledWith({
      where: { slug: "mono" },
      data: { summary: "Updated summary" },
      select: {
        slug: true,
        summary: true,
      },
    });
    expect(result).toEqual({
      caseSlug: "mono",
      summary: "Updated summary",
    });
  });
});

describe("updateGroupMetadata", () => {
  beforeEach(() => {
    caseFindUnique.mockReset();
    groupUpdate.mockReset();
  });

  it("finds a group through its case and only updates title and description", async () => {
    caseFindUnique.mockResolvedValue({
      slug: "mono",
      groups: [
        {
          id: "group-1",
          slug: "comparison",
        },
      ],
    });
    groupUpdate.mockResolvedValue({
      slug: "comparison",
      title: "Comparison",
      description: "Updated description",
    });

    const result = await updateGroupMetadata("mono", "comparison", {
      title: " Comparison ",
      description: " Updated description ",
    });

    expect(groupUpdate).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: {
        title: "Comparison",
        description: "Updated description",
      },
      select: {
        slug: true,
        title: true,
        description: true,
      },
    });
    expect(result).toEqual({
      caseSlug: "mono",
      groupSlug: "comparison",
      title: "Comparison",
      description: "Updated description",
    });
  });

  it("rejects an empty normalized title", async () => {
    await expect(
      updateGroupMetadata("mono", "comparison", {
        title: " ",
        description: "",
      }),
    ).rejects.toThrow("Group title is required.");
    expect(groupUpdate).not.toHaveBeenCalled();
  });
});
