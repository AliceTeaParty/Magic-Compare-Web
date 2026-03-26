import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { listCases } = vi.hoisted(() => ({
  listCases: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  listCases,
}));

describe("POST /api/ops/case-list", () => {
  it("returns every case", async () => {
    listCases.mockResolvedValue([
      {
        id: "case-1",
        slug: "2026",
        title: "2026",
        summary: "ACG quote",
        tags: [],
        status: "internal",
        publishedAt: null,
        updatedAt: "2026-03-19T08:00:00.000Z",
        groupCount: 1,
        publicGroupCount: 0,
      },
    ]);

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cases: [
        {
          id: "case-1",
          slug: "2026",
          title: "2026",
          summary: "ACG quote",
          tags: [],
          status: "internal",
          publishedAt: null,
          updatedAt: "2026-03-19T08:00:00.000Z",
          groupCount: 1,
          publicGroupCount: 0,
        },
      ],
    });
  });
});
