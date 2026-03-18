import { describe, expect, it } from "vitest";
import { createViewerDatasetFromPublishManifest, resolveViewerMode } from "./viewer-data";

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

describe("createViewerDatasetFromPublishManifest", () => {
  it("maps a publish manifest into the published viewer dataset shape", () => {
    const dataset = createViewerDatasetFromPublishManifest({
      schemaVersion: 1,
      publicSlug: "demo-case--banding-check",
      generatedAt: "2026-03-18T04:00:00.000Z",
      assetBasePath: "/published/groups/demo-case--banding-check/assets",
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
  });
});
