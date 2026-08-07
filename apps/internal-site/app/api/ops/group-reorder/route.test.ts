import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "@/lib/server/api/errors";
import { POST } from "./route";

const { reorderGroups } = vi.hoisted(() => ({
  reorderGroups: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  reorderGroups,
}));

beforeEach(() => {
  reorderGroups.mockReset();
});

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
    expect(reorderGroups).toHaveBeenCalledWith("case-1", ["group-2", "group-1", "group-3"]);
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

  it("rejects duplicate group ids before calling the repository", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-reorder", {
        method: "POST",
        body: JSON.stringify({
          caseId: "case-1",
          groupIds: ["group-1", "group-1"],
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(reorderGroups).not.toHaveBeenCalled();
  });

  it("returns 409 for a stale group list", async () => {
    reorderGroups.mockRejectedValue(
      new ConflictError("Group order is stale. Refresh the Case and try again."),
    );

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

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Group order is stale. Refresh the Case and try again.",
    });
  });

  it("returns 500 for unexpected repository failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reorderGroups.mockRejectedValue(new Error("Database unavailable."));

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

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Database unavailable." });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
