import { describe, expect, it } from "vitest";
import type { PublishManifest } from "@magic-compare/content-schema";
import { buildPublicGroupMetadata } from "./page-metadata";

function createManifest(overrides: Partial<PublishManifest> = {}): PublishManifest {
  return {
    schemaVersion: 1,
    publicSlug: "mono--comparison",
    generatedAt: "2026-08-07T00:00:00.000Z",
    assetBasePath: "/published/groups/mono--comparison",
    case: {
      slug: "mono",
      title: "mono",
      subtitle: "",
      summary: "逐帧检查编码前后的画面差异。",
      tags: [],
      publishedAt: "2026-08-07T00:00:00.000Z",
    },
    group: {
      id: "group-1",
      slug: "comparison",
      publicSlug: "mono--comparison",
      title: "随机抽检",
      description: "高动态场景对比。",
      defaultMode: "before-after",
      tags: [],
    },
    frames: [
      {
        id: "frame-1",
        title: "Frame 1",
        caption: "",
        order: 0,
        assets: [
          {
            id: "before-1",
            kind: "before",
            label: "Before",
            imageUrl: "https://assets.example.com/full.png",
            thumbUrl: "https://assets.example.com/thumb.png",
            width: 1920,
            height: 1080,
            note: "",
            isPrimaryDisplay: true,
          },
          {
            id: "after-1",
            kind: "after",
            label: "After",
            imageUrl: "https://assets.example.com/after.png",
            thumbUrl: "https://assets.example.com/after-thumb.png",
            width: 1920,
            height: 1080,
            note: "",
            isPrimaryDisplay: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("public group metadata", () => {
  it("builds canonical and social metadata from the published manifest", () => {
    const metadata = buildPublicGroupMetadata(
      createManifest(),
      new URL("https://compare.example.com/base/"),
    );

    expect(metadata.title).toBe("随机抽检 - mono");
    expect(metadata.description).toBe("查看 随机抽检 - mono，共 1 组对比图。 高动态场景对比。");
    expect(metadata.alternates?.canonical?.toString()).toBe(
      "https://compare.example.com/g/mono--comparison",
    );
    expect(metadata.openGraph).toMatchObject({
      title: "随机抽检 - mono | Magic Compare",
      url: new URL("https://compare.example.com/g/mono--comparison"),
      images: [
        {
          url: new URL("https://compare.example.com/published/groups/mono--comparison/share.jpg"),
          width: 1200,
          height: 630,
          type: "image/jpeg",
          alt: "随机抽检 - mono，1 Groups 图像对比",
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [
        {
          url: new URL("https://compare.example.com/published/groups/mono--comparison/share.jpg"),
        },
      ],
    });
  });

  it("keeps group copy and falls back to the source image without a base URL", () => {
    const manifest = createManifest({
      case: { ...createManifest().case, summary: "真实 Case 摘要。" },
      group: {
        ...createManifest().group,
        title: "mono 随机抽检对比图",
        description: "Imported from mono.",
      },
    });
    const metadata = buildPublicGroupMetadata(manifest, null);

    expect(metadata.title).toBe("mono 随机抽检对比图 - mono");
    expect(metadata.description).toBe(
      "查看 mono 随机抽检对比图 - mono，共 1 组对比图。 Imported from mono.",
    );
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).not.toHaveProperty("url");
    expect(metadata.openGraph).toMatchObject({
      images: [
        {
          url: new URL("https://assets.example.com/full.png"),
          width: 1920,
          height: 1080,
          alt: "mono 随机抽检对比图 - mono · Frame 1 · Before",
        },
      ],
    });
  });

  it("bounds long titles and descriptions without splitting Unicode characters", () => {
    const longTitle = "画".repeat(100);
    const longSummary = "细节".repeat(100);
    const manifest = createManifest({
      case: { ...createManifest().case, title: longTitle, summary: longSummary },
      group: { ...createManifest().group, title: longTitle, description: longSummary },
    });
    const metadata = buildPublicGroupMetadata(manifest, null);

    expect(Array.from(String(metadata.title))).toHaveLength(72);
    expect(String(metadata.title)).toMatch(/…$/);
    expect(Array.from(String(metadata.description))).toHaveLength(160);
    expect(String(metadata.description)).toMatch(/…$/);
  });
});
