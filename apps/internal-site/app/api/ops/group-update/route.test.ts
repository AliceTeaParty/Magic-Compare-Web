import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { updateGroupMetadata } = vi.hoisted(() => ({
  updateGroupMetadata: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  updateGroupMetadata,
}));

describe("POST /api/ops/group-update", () => {
  it("updates a group title and description", async () => {
    updateGroupMetadata.mockResolvedValue({
      caseSlug: "mono",
      groupSlug: "comparison",
      title: "Comparison",
      description: "Updated description",
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-update", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "mono",
          groupSlug: "comparison",
          title: " Comparison ",
          description: " Updated description ",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      caseSlug: "mono",
      groupSlug: "comparison",
      title: "Comparison",
      description: "Updated description",
    });
    expect(updateGroupMetadata).toHaveBeenCalledWith("mono", "comparison", {
      title: "Comparison",
      description: " Updated description ",
    });
  });

  it("rejects an empty title", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-update", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "mono",
          groupSlug: "comparison",
          title: "",
          description: "",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects an empty group slug", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-update", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "mono",
          groupSlug: "",
          title: "Comparison",
          description: "",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("keeps repository errors in the 400 range", async () => {
    updateGroupMetadata.mockRejectedValue(new Error("Group not found."));

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-update", {
        method: "POST",
        body: JSON.stringify({
          caseSlug: "mono",
          groupSlug: "missing",
          title: "Comparison",
          description: "",
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
