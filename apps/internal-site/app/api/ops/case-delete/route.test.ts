import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { deleteCase } = vi.hoisted(() => ({
  deleteCase: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  deleteCase,
}));

describe("POST /api/ops/case-delete", () => {
  it("deletes an empty case", async () => {
    deleteCase.mockResolvedValue({
      caseSlug: "2026",
      deleted: true,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-delete", {
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
    expect(deleteCase).toHaveBeenCalledWith("2026");
  });

  it("rejects invalid payloads", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-delete", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
  });
});
