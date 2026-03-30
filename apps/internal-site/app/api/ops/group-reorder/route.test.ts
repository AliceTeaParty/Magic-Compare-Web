import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { reorderGroups } = vi.hoisted(() => ({
  reorderGroups: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  reorderGroups,
}));

describe("POST /api/ops/group-reorder", () => {
  it("reorders groups within a case", async () => {
    reorderGroups.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-reorder", {
        method: "POST",
        body: JSON.stringify({
          caseId: "case-1",
          groupIds: ["group-2", "group-1", "group-3"],
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(reorderGroups).toHaveBeenCalledWith("case-1", [
      "group-2",
      "group-1",
      "group-3",
    ]);
  });

  it("rejects invalid payloads", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-reorder", {
        method: "POST",
        body: JSON.stringify({
          caseId: "",
          groupIds: [],
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("keeps business errors in the 400 range", async () => {
    reorderGroups.mockRejectedValue(new Error("Case not found."));

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-reorder", {
        method: "POST",
        body: JSON.stringify({
          caseId: "case-1",
          groupIds: ["group-1"],
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
