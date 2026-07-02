import { describe, expect, it } from "vitest";
import { mapCaseWorkspaceData } from "./mappers";

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

    expect(result.groups[0]?.extraAssetLabels).toEqual(["Rip", "Deband"]);
  });
});
