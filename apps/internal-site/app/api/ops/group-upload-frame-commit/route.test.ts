import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { commitGroupUploadFrame } = vi.hoisted(() => ({
  commitGroupUploadFrame: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  commitGroupUploadFrame,
}));

describe("POST /api/ops/group-upload-frame-commit", () => {
  it("commits one frame upload", async () => {
    commitGroupUploadFrame.mockResolvedValue({
      groupUploadJobId: "job-1",
      frameOrder: 0,
      status: "committed",
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-upload-frame-commit", {
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
    expect(commitGroupUploadFrame).toHaveBeenCalledWith({
      groupUploadJobId: "job-1",
      frameOrder: 0,
    });
  });

  it("keeps expected upload-state errors in the 400 range", async () => {
    commitGroupUploadFrame.mockRejectedValue(new Error("Frame is not ready to commit."));

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-upload-frame-commit", {
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

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Frame is not ready to commit.",
    });
  });
});
