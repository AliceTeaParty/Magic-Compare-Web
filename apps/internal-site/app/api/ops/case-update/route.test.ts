import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { updateCaseSummary } = vi.hoisted(() => ({
  updateCaseSummary: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  updateCaseSummary,
}));

describe("POST /api/ops/case-update", () => {
  it("updates a case summary", async () => {
    updateCaseSummary.mockResolvedValue({
      caseSlug: "mono",
      summary: "Updated summary",
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-update", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "mono",
          summary: " Updated summary ",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      caseSlug: "mono",
      summary: "Updated summary",
    });
    expect(updateCaseSummary).toHaveBeenCalledWith(
      "mono",
      " Updated summary ",
    );
  });

  it("rejects invalid payloads", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-update", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "",
          summary: "Updated summary",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("keeps repository errors in the 400 range", async () => {
    updateCaseSummary.mockRejectedValue(new Error("Case not found."));

    const response = await POST(
      new Request("http://localhost:3000/api/ops/case-update", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "missing",
          summary: "",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Case not found." });
  });
});
