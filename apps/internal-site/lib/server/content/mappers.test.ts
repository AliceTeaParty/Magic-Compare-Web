import { describe, expect, it } from "vitest";
import { mapCaseWorkspaceData, mapFrameAssets } from "./mappers";

describe("mapFrameAssets", () => {
  it("inlines the persisted preview in the first Viewer payload", () => {
    const [asset] = mapFrameAssets([
      {
        id: "asset-1",
        frameId: "frame-1",
        kind: "before",
        label: "Before",
        imageUrl: "/groups/group-1/original.webp",
        thumbUrl: "/groups/group-1/thumb.webp",
        width: 1920,
        height: 1080,
        note: "",
        isPublic: true,
        isPrimaryDisplay: true,
        storageValidatedAt: null,
        imagePlaceholderJson: JSON.stringify({
          dataUrl: "data:image/webp;base64,UklGRg==",
          sourceColor: "#AABBCC",
        }),
      },
    ]);

    expect(asset?.placeholder).toEqual({
      dataUrl: "data:image/webp;base64,UklGRg==",
      sourceColor: "#AABBCC",
    });
  });
});

describe("mapCaseWorkspaceData", () => {
  it("uses first-frame extra asset labels instead of default viewer mode tags", () => {
    const result = mapCaseWorkspaceData({
      id: "case-1",
      slug: "mono",
      title: "mono",
      summary: "",
      status: "internal",
      publishedAt: null,
      tagsJson: "[]",
      groups: [
        {
          id: "group-1",
          slug: "comparison",
          title: "Comparison",
          description: "",
          order: 0,
          defaultMode: "before-after",
          isPublic: false,
          publicSlug: null,
          _count: { frames: 2 },
          frames: [
            {
              assets: [
                { kind: "before", label: "Before" },
                { kind: "after", label: "After" },
                { kind: "heatmap", label: "Heatmap" },
                { kind: "misc", label: "Rip" },
                { kind: "misc", label: "Deband" },
                { kind: "misc", label: "rip" },
              ],
            },
          ],
        },
      ],
    });

    expect(result.groups[0]?.defaultMode).toBe("a-b");
    expect(result.groups[0]?.extraAssetLabels).toEqual(["Rip", "Deband"]);
  });
});
