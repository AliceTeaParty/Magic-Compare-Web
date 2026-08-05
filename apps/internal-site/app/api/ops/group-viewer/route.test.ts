import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getViewerDataset } = vi.hoisted(() => ({
  getViewerDataset: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  getViewerDataset,
}));

describe("POST /api/ops/group-viewer", () => {
  it("returns one Viewer dataset for client-side Group navigation", async () => {
    const dataset = {
      caseMeta: { slug: "gaia", title: "Gaia", summary: "", tags: [] },
      group: {
        id: "group-ov",
        slug: "ov",
        title: "OV",
        description: "",
        defaultMode: "before-after",
        tags: [],
        isPublic: false,
        frames: [],
      },
      siblingGroups: [],
      publishStatus: { status: "internal" },
    };
    getViewerDataset.mockResolvedValue(dataset);

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-viewer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseSlug: "gaia", groupSlug: "ov" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dataset });
    expect(getViewerDataset).toHaveBeenCalledWith("gaia", "ov");
  });

  it("returns 404 for a missing Group", async () => {
    getViewerDataset.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-viewer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseSlug: "gaia", groupSlug: "missing" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Group not found." });
  });
});
