import { describe, expect, it } from "vitest";
import {
  createViewerDatasetFromPublishManifest,
  getNextAbAssetSelection,
  resolveViewerMode,
} from "./viewer-data";

describe("resolveViewerMode", () => {
  const frameWithoutHeatmap = {
    id: "frame-1",
    title: "Frame A",
    caption: "",
    order: 0,
    assets: [
      {
        id: "before-1",
        kind: "before" as const,
        label: "Before",
        imageUrl: "/before.png",
        thumbUrl: "/before-thumb.png",
        width: 1280,
        height: 720,
        note: "",
        isPrimaryDisplay: true,
      },
      {
        id: "after-1",
        kind: "after" as const,
        label: "After",
        imageUrl: "/after.png",
        thumbUrl: "/after-thumb.png",
        width: 1280,
        height: 720,
        note: "",
        isPrimaryDisplay: true,
      },
    ],
  };

  it("falls back from heatmap to before-after when the frame has no heatmap asset", () => {
    expect(resolveViewerMode("heatmap", frameWithoutHeatmap, "heatmap")).toBe("before-after");
  });
});

describe("getNextAbAssetSelection", () => {
  const comparisonAssets = [
    {
      id: "rip",
      kind: "after" as const,
      label: "Rip",
      imageUrl: "/rip.png",
      thumbUrl: "/rip-thumb.png",
      width: 1920,
      height: 1080,
      note: "",
      isPrimaryDisplay: true,
    },
    {
      id: "flt",
      kind: "misc" as const,
      label: "Flt",
      imageUrl: "/flt.png",
      thumbUrl: "/flt-thumb.png",
      width: 1920,
      height: 1080,
      note: "",
      isPrimaryDisplay: false,
    },
  ];

  it("cycles the baseline through every comparison target before returning", () => {
    const rip = getNextAbAssetSelection({ side: "before" }, comparisonAssets);
    const flt = getNextAbAssetSelection(rip, comparisonAssets);
    const baseline = getNextAbAssetSelection(flt, comparisonAssets);

    expect(rip).toEqual({ comparisonAssetKey: "after:rip", side: "after" });
    expect(flt).toEqual({ comparisonAssetKey: "misc:flt", side: "after" });
    expect(baseline).toEqual({ side: "before" });
  });

  it("restores the first comparison target when the selected column disappeared", () => {
    expect(
      getNextAbAssetSelection(
        { comparisonAssetKey: "misc:missing", side: "after" },
        comparisonAssets,
      ),
    ).toEqual({ comparisonAssetKey: "after:rip", side: "after" });
  });
});

describe("createViewerDatasetFromPublishManifest", () => {
  it("maps a publish manifest into the published viewer dataset shape", () => {
    const dataset = createViewerDatasetFromPublishManifest({
      schemaVersion: 2,
      publicSlug: "demo-case--banding-check",
      generatedAt: "2026-03-18T04:00:00.000Z",
      assetBasePath:
        "https://assets.example.com/magic-compare-assets/internal-assets/demo-case/banding-check",
      case: {
        slug: "demo-case",
        title: "Demo Case",
        subtitle: "",
        summary: "",
        tags: ["grain"],
        publishedAt: "2026-03-18T04:00:00.000Z",
      },
      group: {
        id: "group-1",
        slug: "banding-check",
        publicSlug: "demo-case--banding-check",
        title: "Banding Check",
        description: "",
        defaultMode: "before-after",
        tags: ["grain"],
      },
      frames: [
        {
          id: "frame-1",
          title: "Frame A",
          caption: "",
          order: 0,
          assets: [
            {
              id: "before-1",
              kind: "before",
              label: "Before",
              imageUrl: "/before.png",
              thumbUrl: "/before-thumb.png",
              width: 1280,
              height: 720,
              note: "",
              isPrimaryDisplay: true,
              placeholder: {
                dataUrl: "data:image/webp;base64,UklGRg==",
                sourceColor: "#AABBCC",
              },
            },
            {
              id: "after-1",
              kind: "after",
              label: "After",
              imageUrl: "/after.png",
              thumbUrl: "/after-thumb.png",
              width: 1280,
              height: 720,
              note: "",
              isPrimaryDisplay: true,
            },
          ],
        },
      ],
    });

    expect(dataset.group.publicSlug).toBe("demo-case--banding-check");
    expect(dataset.publishStatus?.status).toBe("published");
    expect(dataset.group.frames).toHaveLength(1);
    expect(dataset.group.frames[0]?.assets[0]?.placeholder).toEqual({
      dataUrl: "data:image/webp;base64,UklGRg==",
      sourceColor: "#AABBCC",
    });
  });
});
