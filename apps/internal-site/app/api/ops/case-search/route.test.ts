import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { searchCases } = vi.hoisted(() => ({
  searchCases: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  searchCases,
}));

describe("POST /api/ops/case-search", () => {
  it("returns a case list for valid input", async () => {
    searchCases.mockResolvedValue([
      {
        id: "case-1",
        slug: "2026",
        title: "2026",
        subtitle: "",
        summary: "ACG quote",
        tags: [],
        status: "internal",
        publishedAt: null,
        updatedAt: "2026-03-19T08:00:00.000Z",
        groupCount: 1,
        publicGroupCount: 0,
        groups: [
          {
            slug: "test-group",
            title: "Test Group",
          },
        ],
      },
    ]);

    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-search", {
        method: "POST",
        body: JSON.stringify({
          query: "2026",
          limit: 5,
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cases: [
        {
          id: "case-1",
          slug: "2026",
          title: "2026",
          subtitle: "",
          summary: "ACG quote",
          tags: [],
          status: "internal",
          publishedAt: null,
          updatedAt: "2026-03-19T08:00:00.000Z",
          groupCount: 1,
          publicGroupCount: 0,
          groups: [
            {
              slug: "test-group",
              title: "Test Group",
            },
          ],
        },
      ],
    });
    expect(searchCases).toHaveBeenCalledWith("2026", 5);
  });

  it("rejects invalid limits", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-search", {
        method: "POST",
        body: JSON.stringify({
          query: "2026",
          limit: 0,
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
  });
});
