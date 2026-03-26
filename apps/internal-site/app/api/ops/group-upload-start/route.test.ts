import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { startGroupUpload } = vi.hoisted(() => ({
  startGroupUpload: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  startGroupUpload,
}));

describe("POST /api/ops/group-upload-start", () => {
  it("starts a group upload job", async () => {
    startGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-1",
      frameStates: [],
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-upload-start", {
        method: "POST",
        body: JSON.stringify({
          case: {
            slug: "2026",
            title: "2026",
            summary: "",
            tags: [],
            coverAssetLabel: "After",
          },
          group: {
            slug: "test-group",
            title: "Test Group",
            description: "",
            order: 0,
            defaultMode: "before-after",
            tags: [],
          },
          frames: [],
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(startGroupUpload).toHaveBeenCalled();
  });
});
