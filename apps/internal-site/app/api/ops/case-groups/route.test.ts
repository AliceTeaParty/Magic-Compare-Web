import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getCaseWorkspace } = vi.hoisted(() => ({
  getCaseWorkspace: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  getCaseWorkspace,
}));

describe("POST /api/ops/case-groups", () => {
  it("returns the groups for one case", async () => {
    getCaseWorkspace.mockResolvedValue({
      id: "case-1",
      slug: "2026",
      title: "2026",
      summary: "ACG quote",
      status: "internal",
      publishedAt: null,
      tags: ["demo"],
      groups: [
        {
          id: "group-1",
          slug: "test-group",
          title: "Test Group",
          description: "",
          order: 0,
          defaultMode: "before-after",
          isPublic: false,
          publicSlug: null,
          frameCount: 12,
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-groups", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "2026",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      case: {
        id: "case-1",
        slug: "2026",
        title: "2026",
        summary: "ACG quote",
        status: "internal",
        publishedAt: null,
        tags: ["demo"],
      },
      groups: [
        {
          id: "group-1",
          slug: "test-group",
          title: "Test Group",
          description: "",
          order: 0,
          defaultMode: "before-after",
          isPublic: false,
          publicSlug: null,
          frameCount: 12,
        },
      ],
    });
  });

  it("returns 404 for a missing case", async () => {
    getCaseWorkspace.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-groups", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "missing",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Case not found.",
    });
  });
});
