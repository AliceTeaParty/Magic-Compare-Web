import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { cancelGroupUpload } = vi.hoisted(() => ({
  cancelGroupUpload: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  cancelGroupUpload,
}));

describe("POST /api/ops/group-upload-cancel", () => {
  it("cancels an active group upload job", async () => {
    cancelGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-1",
      status: "cancelled",
      deletedPendingPrefixCount: 2,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-upload-cancel", {
        method: "POST",
        body: JSON.stringify({
          groupUploadJobId: "job-1",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(cancelGroupUpload).toHaveBeenCalledWith({
      groupUploadJobId: "job-1",
    });
  });
});
