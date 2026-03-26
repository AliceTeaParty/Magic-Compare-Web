import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { prepareGroupUploadFrame } = vi.hoisted(() => ({
  prepareGroupUploadFrame: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  prepareGroupUploadFrame,
}));

describe("POST /api/ops/group-upload-frame-prepare", () => {
  it("prepares one frame upload", async () => {
    prepareGroupUploadFrame.mockResolvedValue({
      groupUploadJobId: "job-1",
      frameOrder: 0,
      pendingPrefix: "/groups/group-1/1/revision-1",
      files: [],
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-upload-frame-prepare", {
        method: "POST",
        body: JSON.stringify({
          groupUploadJobId: "job-1",
          frameOrder: 0,
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(prepareGroupUploadFrame).toHaveBeenCalledWith({
      groupUploadJobId: "job-1",
      frameOrder: 0,
    });
  });
});
