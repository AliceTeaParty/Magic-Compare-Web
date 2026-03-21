import { describe, expect, it } from "vitest";
import { getValidatedPublicAssets } from "./validate-public-frame";

describe("getValidatedPublicAssets", () => {
  it("throws when the frame is missing a public before/after pair", () => {
    expect(() =>
      getValidatedPublicAssets({
        title: "Frame 1",
        assets: [
          {
            id: "before-1",
            kind: "before",
            label: "Before",
            imageUrl: "/before.png",
            thumbUrl: "/before-thumb.png",
            width: 1920,
            height: 1080,
            note: "",
            isPublic: true,
            isPrimaryDisplay: true,
          },
        ],
      }),
    ).toThrow('Frame "Frame 1" is missing a before/after asset pair.');
  });

  it("returns only public assets when the pair exists", () => {
    expect(
      getValidatedPublicAssets({
        title: "Frame 1",
        assets: [
          {
            id: "before-1",
            kind: "before",
            label: "Before",
            imageUrl: "/before.png",
            thumbUrl: "/before-thumb.png",
            width: 1920,
            height: 1080,
            note: "",
            isPublic: true,
            isPrimaryDisplay: true,
          },
          {
            id: "after-1",
            kind: "after",
            label: "After",
            imageUrl: "/after.png",
            thumbUrl: "/after-thumb.png",
            width: 1920,
            height: 1080,
            note: "",
            isPublic: true,
            isPrimaryDisplay: true,
          },
          {
            id: "debug-1",
            kind: "misc",
            label: "Debug",
            imageUrl: "/debug.png",
            thumbUrl: "/debug-thumb.png",
            width: 640,
            height: 360,
            note: "",
            isPublic: false,
            isPrimaryDisplay: false,
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({ kind: "before" }),
      expect.objectContaining({ kind: "after" }),
    ]);
  });
});
