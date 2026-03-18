import { describe, expect, it } from "vitest";
import { ImportManifestSchema, PUBLISH_SCHEMA_VERSION, PublishManifestSchema } from "./index";

describe("ImportManifestSchema", () => {
  it("accepts a valid frame with before and after primary assets", () => {
    const manifest = ImportManifestSchema.parse({
      case: {
        slug: "demo-case",
        title: "Demo Case",
        subtitle: "",
        summary: "",
        tags: [],
        status: "draft",
        coverAssetLabel: "After",
      },
      groups: [
        {
          group: {
            slug: "banding-check",
            title: "Banding Check",
            description: "",
            order: 0,
            defaultMode: "before-after",
            isPublic: true,
            tags: [],
          },
          frames: [
            {
              frame: {
                title: "Frame A",
                caption: "",
                order: 0,
                isPublic: true,
              },
              assets: [
                {
                  kind: "before",
                  label: "Before",
                  imageUrl: "/internal-assets/demo/before.png",
                  thumbUrl: "/internal-assets/demo/thumb-before.png",
                  width: 1280,
                  height: 720,
                  note: "",
                  isPublic: true,
                  isPrimaryDisplay: true,
                },
                {
                  kind: "after",
                  label: "After",
                  imageUrl: "/internal-assets/demo/after.png",
                  thumbUrl: "/internal-assets/demo/thumb-after.png",
                  width: 1280,
                  height: 720,
                  note: "",
                  isPublic: true,
                  isPrimaryDisplay: true,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(manifest.groups[0]?.frames[0]?.assets).toHaveLength(2);
  });

  it("rejects frames without a complete before/after pair", () => {
    expect(() =>
      ImportManifestSchema.parse({
        case: {
          slug: "demo-case",
          title: "Demo Case",
          subtitle: "",
          summary: "",
          tags: [],
          status: "draft",
          coverAssetLabel: "After",
        },
        groups: [
          {
            group: {
              slug: "banding-check",
              title: "Banding Check",
              description: "",
              order: 0,
              defaultMode: "before-after",
              isPublic: true,
              tags: [],
            },
            frames: [
              {
                frame: {
                  title: "Frame A",
                  caption: "",
                  order: 0,
                  isPublic: true,
                },
                assets: [
                  {
                    kind: "before",
                    label: "Before",
                    imageUrl: "/internal-assets/demo/before.png",
                    thumbUrl: "/internal-assets/demo/thumb-before.png",
                    width: 1280,
                    height: 720,
                    note: "",
                    isPublic: true,
                    isPrimaryDisplay: true,
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toThrowError(/before and after/);
  });
});

describe("PublishManifestSchema", () => {
  it("requires a schemaVersion from the first public artifact", () => {
    const parsed = PublishManifestSchema.parse({
      schemaVersion: PUBLISH_SCHEMA_VERSION,
      publicSlug: "demo-case--banding-check",
      generatedAt: "2026-03-18T04:00:00.000Z",
      assetBasePath: "/published/groups/demo-case--banding-check/assets",
      case: {
        slug: "demo-case",
        title: "Demo Case",
        subtitle: "",
        summary: "",
        tags: [],
        publishedAt: "2026-03-18T04:00:00.000Z",
      },
      group: {
        id: "group-1",
        slug: "banding-check",
        publicSlug: "demo-case--banding-check",
        title: "Banding Check",
        description: "",
        defaultMode: "before-after",
        tags: [],
      },
      frames: [
        {
          id: "frame-1",
          title: "Frame A",
          caption: "",
          order: 0,
          assets: [
            {
              id: "asset-1",
              kind: "before",
              label: "Before",
              imageUrl: "/published/groups/demo/assets/before.png",
              thumbUrl: "/published/groups/demo/assets/thumb-before.png",
              width: 1280,
              height: 720,
              note: "",
              isPrimaryDisplay: true,
            },
            {
              id: "asset-2",
              kind: "after",
              label: "After",
              imageUrl: "/published/groups/demo/assets/after.png",
              thumbUrl: "/published/groups/demo/assets/thumb-after.png",
              width: 1280,
              height: 720,
              note: "",
              isPrimaryDisplay: true,
            },
          ],
        },
      ],
    });

    expect(parsed.schemaVersion).toBe(PUBLISH_SCHEMA_VERSION);
  });
});
