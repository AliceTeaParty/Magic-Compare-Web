import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/lib/server/api/errors";
import { POST } from "./route";

const { updateCaseMetadata } = vi.hoisted(() => ({
  updateCaseMetadata: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  updateCaseMetadata,
}));

describe("POST /api/ops/case-update", () => {
  it("updates a case summary", async () => {
    updateCaseMetadata.mockResolvedValue({
      caseSlug: "mono",
      title: "Mono",
      summary: "Updated summary",
      tags: [],
      status: "internal",
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
      title: "Mono",
      summary: "Updated summary",
      tags: [],
      status: "internal",
    });
    expect(updateCaseMetadata).toHaveBeenCalledWith("mono", {
      title: undefined,
      summary: " Updated summary ",
      tags: undefined,
    });
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

  it("returns 404 when the case no longer exists", async () => {
    updateCaseMetadata.mockRejectedValue(new NotFoundError("Case not found."));

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

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Case not found." });
  });
});
