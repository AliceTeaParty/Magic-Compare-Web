import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { completeGroupUpload } = vi.hoisted(() => ({
  completeGroupUpload: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  completeGroupUpload,
}));

describe("POST /api/ops/group-upload-complete", () => {
  it("completes a group upload job", async () => {
    completeGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-1",
      caseSlug: "2026",
      groupSlug: "test-group",
      committedFrameCount: 2,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-upload-complete", {
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
    expect(completeGroupUpload).toHaveBeenCalledWith({
      groupUploadJobId: "job-1",
    });
  });
});
