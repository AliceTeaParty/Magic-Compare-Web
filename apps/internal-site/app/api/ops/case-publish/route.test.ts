import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { publishCase } = vi.hoisted(() => ({
  publishCase: vi.fn(),
}));

vi.mock("@/lib/server/publish/publish-case", () => ({
  publishCase,
}));

describe("POST /api/ops/case-publish", () => {
  it("publishes a case", async () => {
    publishCase.mockResolvedValue({
      publishedAt: "2026-03-30T00:00:00.000Z",
      groups: [{ groupId: "group-1", publicSlug: "case-group-1" }],
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-publish", {
        method: "POST",
        body: JSON.stringify({
          caseId: "case-1",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      publishedAt: "2026-03-30T00:00:00.000Z",
      groups: [{ groupId: "group-1", publicSlug: "case-group-1" }],
    });
    expect(publishCase).toHaveBeenCalledWith("case-1");
  });

  it("keeps publish business errors in the 400 range", async () => {
    publishCase.mockRejectedValue(new Error("No public groups are available for publishing."));

    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-publish", {
        method: "POST",
        body: JSON.stringify({
          caseId: "case-1",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "No public groups are available for publishing.",
    });
  });
});
