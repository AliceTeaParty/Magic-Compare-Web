import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { deleteGroup } = vi.hoisted(() => ({
  deleteGroup: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  deleteGroup,
}));

describe("POST /api/ops/group-delete", () => {
  it("deletes a selected group", async () => {
    deleteGroup.mockResolvedValue({
      caseSlug: "2026",
      groupSlug: "test-example",
      groupTitle: "Test Example",
      removedPublishedBundle: false,
      publicSlug: null,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-delete", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "2026",
          groupSlug: "test-example",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteGroup).toHaveBeenCalledWith("2026", "test-example");
  });

  it("rejects invalid payloads", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-delete", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "",
          groupSlug: "test-example",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
  });
});
