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
  it("keeps version 1 manifests compatible without image placeholders", () => {
    const parsed = PublishManifestSchema.parse({
      schemaVersion: 1,
      publicSlug: "demo-case--banding-check",
      generatedAt: "2026-03-18T04:00:00.000Z",
      assetBasePath: "https://assets.example.com/groups/demo",
      case: {
        slug: "demo-case",
        title: "Demo Case",
        subtitle: "",
        summary: "",
        tags: [],
        publishedAt: null,
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
              imageUrl: "https://assets.example.com/before.png",
              thumbUrl: "https://assets.example.com/before-thumb.png",
              width: 1280,
              height: 720,
              note: "",
              isPrimaryDisplay: true,
            },
            {
              id: "asset-2",
              kind: "after",
              label: "After",
              imageUrl: "https://assets.example.com/after.png",
              thumbUrl: "https://assets.example.com/after-thumb.png",
              width: 1280,
              height: 720,
              note: "",
              isPrimaryDisplay: true,
            },
          ],
        },
      ],
    });

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.frames[0]?.assets[0]?.placeholder).toBeUndefined();
  });

  it("requires a schemaVersion from the first public artifact", () => {
    const parsed = PublishManifestSchema.parse({
      schemaVersion: PUBLISH_SCHEMA_VERSION,
      publicSlug: "demo-case--banding-check",
      generatedAt: "2026-03-18T04:00:00.000Z",
      assetBasePath:
        "https://assets.example.com/magic-compare-assets/internal-assets/demo-case/banding-check",
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
              imageUrl:
                "https://assets.example.com/magic-compare-assets/internal-assets/demo-case/banding-check/001/before.png",
              thumbUrl:
                "https://assets.example.com/magic-compare-assets/internal-assets/demo-case/banding-check/001/thumb-before.png",
              width: 1280,
              height: 720,
              note: "",
              isPrimaryDisplay: true,
              placeholder: {
                dataUrl: "data:image/webp;base64,UklGRg==",
                sourceColor: "#aabbcc",
              },
            },
            {
              id: "asset-2",
              kind: "after",
              label: "After",
              imageUrl:
                "https://assets.example.com/magic-compare-assets/internal-assets/demo-case/banding-check/001/after.png",
              thumbUrl:
                "https://assets.example.com/magic-compare-assets/internal-assets/demo-case/banding-check/001/thumb-after.png",
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
    expect(parsed.frames[0]?.assets[0]?.placeholder?.sourceColor).toBe("#AABBCC");
  });

  it("rejects malformed inline image placeholders", () => {
    expect(() =>
      PublishManifestSchema.shape.frames.element.shape.assets.element.parse({
        id: "asset-1",
        kind: "before",
        label: "Before",
        imageUrl: "https://assets.example.com/before.png",
        thumbUrl: "https://assets.example.com/before-thumb.png",
        width: 1280,
        height: 720,
        note: "",
        isPrimaryDisplay: true,
        placeholder: {
          dataUrl: "https://assets.example.com/preview.webp",
          sourceColor: "red",
        },
      }),
    ).toThrow();
  });
});
