import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { setGroupVisibility } = vi.hoisted(() => ({
  setGroupVisibility: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  setGroupVisibility,
}));

describe("POST /api/ops/group-visibility", () => {
  it("updates a group's public visibility", async () => {
    setGroupVisibility.mockResolvedValue({
      caseSlug: "2026",
      groupSlug: "test-example",
      isPublic: true,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-visibility", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "2026",
          groupSlug: "test-example",
          isPublic: true,
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(setGroupVisibility).toHaveBeenCalledWith("2026", "test-example", true);
  });

  it("rejects invalid payloads", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-visibility", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "2026",
          groupSlug: "",
          isPublic: true,
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
  });
});
