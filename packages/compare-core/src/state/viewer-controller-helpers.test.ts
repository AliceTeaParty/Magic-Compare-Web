import { describe, expect, it } from "vitest";
import { buildFrameAssets, buildFrameState, resolveFrameId } from "./viewer-controller-helpers";

const frames = [
  {
    id: "frame-1",
    title: "Frame 1",
    caption: "",
    order: 0,
    assets: [
      {
        id: "before-1",
        kind: "before" as const,
        label: "Before",
        imageUrl: "/before-1.png",
        thumbUrl: "/before-1-thumb.png",
        width: 1920,
        height: 1080,
        note: "",
        isPrimaryDisplay: true,
      },
      {
        id: "after-1",
        kind: "after" as const,
        label: "After",
        imageUrl: "/after-1.png",
        thumbUrl: "/after-1-thumb.png",
        width: 1920,
        height: 1080,
        note: "",
        isPrimaryDisplay: true,
      },
    ],
  },
  {
    id: "frame-2",
    title: "Frame 2",
    caption: "",
    order: 1,
    assets: [
      {
        id: "before-2",
        kind: "before" as const,
        label: "Src",
        imageUrl: "/before-2.png",
        thumbUrl: "/before-2-thumb.png",
        width: 1920,
        height: 1080,
        note: "",
        isPrimaryDisplay: true,
      },
      {
        id: "after-2",
        kind: "after" as const,
        label: "Rip",
        imageUrl: "/after-2.png",
        thumbUrl: "/after-2-thumb.png",
        width: 1920,
        height: 1080,
        note: "",
        isPrimaryDisplay: true,
      },
      {
        id: "heatmap-2",
        kind: "heatmap" as const,
        label: "Heatmap",
        imageUrl: "/heatmap-2.png",
        thumbUrl: "/heatmap-2-thumb.png",
        width: 1920,
        height: 1080,
        note: "Auto-generated from frame-2-src.png vs frame-2-flt.png",
        isPrimaryDisplay: false,
      },
      {
        id: "flt-2",
        kind: "misc" as const,
        label: "Flt",
        imageUrl: "/flt-2.png",
        thumbUrl: "/flt-2-thumb.png",
        width: 1920,
        height: 1080,
        note: "frame-2-flt.png",
        isPrimaryDisplay: false,
      },
    ],
  },
];

describe("viewer-controller-helpers", () => {
  it("falls back to the first frame when the requested id is missing", () => {
    expect(resolveFrameId(frames, "missing-frame")).toBe("frame-1");
  });

  it("derives frame state from the selected frame", () => {
    expect(buildFrameState(frames, "frame-2")).toEqual({
      currentFrame: frames[1],
      currentFrameIndex: 1,
      availableModes: ["before-after", "a-b", "heatmap"],
    });
  });

  it("maps the frame assets used by the viewer panes", () => {
    expect(buildFrameAssets(frames[1])).toEqual({
      beforeAsset: frames[1].assets[0],
      afterAsset: frames[1].assets[1],
      comparisonAssets: [frames[1].assets[1], frames[1].assets[3]],
      heatmapReferenceAsset: frames[1].assets[3],
      heatmapAsset: frames[1].assets[2],
    });
  });

  it("selects an uploaded misc variable as the active comparison target", () => {
    expect(buildFrameAssets(frames[1], "misc:flt")).toMatchObject({
      beforeAsset: frames[1].assets[0],
      afterAsset: frames[1].assets[3],
      comparisonAssets: [frames[1].assets[1], frames[1].assets[3]],
    });
  });

  it("falls back to the primary after asset when a frame lacks the preferred variable", () => {
    expect(buildFrameAssets(frames[0], "misc:flt").afterAsset).toBe(frames[0].assets[1]);
  });
});
