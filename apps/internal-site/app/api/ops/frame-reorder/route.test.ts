import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { reorderFrames } = vi.hoisted(() => ({
  reorderFrames: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  reorderFrames,
}));

describe("POST /api/ops/frame-reorder", () => {
  it("reorders frames within a group", async () => {
    reorderFrames.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost:3000/api/ops/frame-reorder", {
        method: "POST",
        body: JSON.stringify({
          groupId: "group-1",
          frameIds: ["frame-2", "frame-1", "frame-3"],
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(reorderFrames).toHaveBeenCalledWith("group-1", [
      "frame-2",
      "frame-1",
      "frame-3",
    ]);
  });

  it("rejects invalid payloads", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/ops/frame-reorder", {
        method: "POST",
        body: JSON.stringify({
          groupId: "",
          frameIds: [],
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("keeps business errors in the 400 range", async () => {
    reorderFrames.mockRejectedValue(new Error("Group not found."));

    const response = await POST(
      new Request("http://localhost:3000/api/ops/frame-reorder", {
        method: "POST",
        body: JSON.stringify({
          groupId: "group-1",
          frameIds: ["frame-1"],
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Group not found." });
  });
});
