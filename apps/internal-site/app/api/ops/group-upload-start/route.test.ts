import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { startGroupUpload } = vi.hoisted(() => ({
  startGroupUpload: vi.fn(),
}));

vi.mock("@/lib/server/repositories/content-repository", () => ({
  startGroupUpload,
}));

describe("POST /api/ops/group-upload-start", () => {
  const validPayload = {
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
    frames: [
      {
        order: 0,
        title: "Frame 1",
        caption: "",
        assets: [
          {
            slot: "before",
            kind: "before",
            label: "Before",
            note: "",
            width: 1,
            height: 1,
            isPrimaryDisplay: true,
            original: {
              extension: ".png",
              contentType: "image/png",
              sha256: "a".repeat(64),
              size: 1,
            },
            thumbnail: {
              extension: ".png",
              contentType: "image/png",
              sha256: "b".repeat(64),
              size: 1,
            },
          },
          {
            slot: "after",
            kind: "after",
            label: "After",
            note: "",
            width: 1,
            height: 1,
            isPrimaryDisplay: true,
            original: {
              extension: ".png",
              contentType: "image/png",
              sha256: "c".repeat(64),
              size: 1,
            },
            thumbnail: {
              extension: ".png",
              contentType: "image/png",
              sha256: "d".repeat(64),
              size: 1,
            },
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    startGroupUpload.mockReset();
  });

  it("starts a group upload job", async () => {
    startGroupUpload.mockResolvedValue({
      groupUploadJobId: "job-1",
      frameStates: [],
    });

    const response = await POST(
      new Request("http://localhost:3000/api/ops/group-upload-start", {
        method: "POST",
        body: JSON.stringify(validPayload),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(startGroupUpload).toHaveBeenCalled();
  });

  it("rejects case and group slugs that contain the public slug separator", async () => {
    for (const payload of [
      {
        ...validPayload,
        case: { ...validPayload.case, slug: "bad--case" },
      },
      {
        ...validPayload,
        group: { ...validPayload.group, slug: "bad--group" },
      },
    ]) {
      const response = await POST(
        new Request("http://localhost:3000/api/ops/group-upload-start", {
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "content-type": "application/json",
          },
        }),
      );

      expect(response.status).toBe(400);
    }

    expect(startGroupUpload).not.toHaveBeenCalledWith(
      expect.objectContaining({
        case: expect.objectContaining({ slug: "bad--case" }),
      }),
    );
  });
});
