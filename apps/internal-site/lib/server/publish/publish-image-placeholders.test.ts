import { PUBLISH_SCHEMA_VERSION, type PublishManifest } from "@magic-compare/content-schema";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  enrichPublishManifestWithPlaceholders,
  generatePublishImagePlaceholder,
} from "./publish-image-placeholders";

async function createSolidImage(
  width: number,
  height: number,
  background: { r: number; g: number; b: number; alpha: number },
) {
  return sharp({ create: { width, height, channels: 4, background } })
    .png()
    .toBuffer();
}

function buildManifest(assetCount = 2): PublishManifest {
  return {
    schemaVersion: PUBLISH_SCHEMA_VERSION,
    publicSlug: "case--group",
    generatedAt: "2026-08-08T00:00:00.000Z",
    assetBasePath: "https://assets.example.com/groups/group-1",
    case: {
      slug: "case",
      title: "Case",
      subtitle: "",
      summary: "",
      tags: [],
      publishedAt: "2026-08-08T00:00:00.000Z",
    },
    group: {
      id: "group-1",
      slug: "group",
      publicSlug: "case--group",
      title: "Group",
      description: "",
      defaultMode: "before-after",
      tags: [],
    },
    frames: [
      {
        id: "frame-1",
        title: "Frame 1",
        caption: "",
        order: 0,
        assets: Array.from({ length: assetCount }, (_, index) => ({
          id: `asset-${index}`,
          kind: index === 0 ? ("before" as const) : ("after" as const),
          label: `Asset ${index}`,
          imageUrl: `https://assets.example.com/image-${index}.png`,
          thumbUrl: `https://assets.example.com/thumb-${index}.png`,
          width: 1920,
          height: 1080,
          note: "",
          isPrimaryDisplay: index < 2,
        })),
      },
    ],
  };
}

describe("publish image placeholders", () => {
  it("auto-orients, bounds, and encodes the preview while extracting Material color", async () => {
    const oriented = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "#ff0000" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const placeholder = await generatePublishImagePlaceholder(oriented);
    expect(placeholder?.dataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(placeholder?.dataUrl.length).toBeLessThanOrEqual(512);
    const sourceColor = placeholder?.sourceColor ?? "#000000";
    expect(Number.parseInt(sourceColor.slice(1, 3), 16)).toBeGreaterThanOrEqual(250);
    expect(Number.parseInt(sourceColor.slice(3, 5), 16)).toBeLessThanOrEqual(2);
    expect(Number.parseInt(sourceColor.slice(5, 7), 16)).toBeLessThanOrEqual(2);

    const preview = Buffer.from(placeholder?.dataUrl.split(",")[1] ?? "", "base64");
    await expect(sharp(preview).metadata()).resolves.toMatchObject({ width: 4, height: 8 });
  });

  it("omits a placeholder when the source contains no opaque reference pixels", async () => {
    const transparent = await createSolidImage(8, 8, { r: 20, g: 40, b: 60, alpha: 0 });
    await expect(generatePublishImagePlaceholder(transparent)).resolves.toBeNull();
  });

  it("reuses unchanged v2 assets, limits reads to four, and contains failures", async () => {
    const manifest = buildManifest(7);
    const reusable = {
      dataUrl: "data:image/webp;base64,UklGRg==",
      sourceColor: "#AABBCC",
    };
    const previousManifest: PublishManifest = {
      ...manifest,
      frames: [
        {
          ...manifest.frames[0]!,
          assets: manifest.frames[0]!.assets.map((asset, index) =>
            index === 0 ? { ...asset, placeholder: reusable } : asset,
          ),
        },
      ],
    };
    const sourceAssets = manifest.frames[0]!.assets.map((asset) => ({
      id: asset.id,
      thumbUrl: `/groups/group-1/${asset.id}-thumb.png`,
    }));
    const red = await createSolidImage(16, 9, { r: 255, g: 0, b: 0, alpha: 1 });
    let activeReads = 0;
    let maxActiveReads = 0;
    const readThumbnail = async (logicalPath: string, maxBytes: number) => {
      expect(maxBytes).toBe(8 * 1024 * 1024);
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeReads -= 1;
      if (logicalPath.includes("asset-3")) throw new Error("broken thumbnail");
      return red;
    };

    const result = await enrichPublishManifestWithPlaceholders({
      manifest,
      previousManifest,
      sourceAssets,
      readThumbnail,
    });

    expect(maxActiveReads).toBeLessThanOrEqual(4);
    expect(result.stats).toEqual({ generated: 5, reused: 1, failed: 1 });
    expect(result.manifest.frames[0]?.assets[0]?.placeholder).toEqual(reusable);
    expect(result.manifest.frames[0]?.assets[3]?.placeholder).toBeUndefined();
    expect(result.manifest.frames[0]?.assets[6]?.placeholder?.sourceColor).toBe("#FF0000");
  });

  it("regenerates an asset when its public thumbnail URL changes", async () => {
    const manifest = buildManifest();
    const previousManifest = buildManifest();
    previousManifest.frames[0]!.assets[0] = {
      ...previousManifest.frames[0]!.assets[0]!,
      thumbUrl: "https://assets.example.com/old-thumb.png",
      placeholder: {
        dataUrl: "data:image/webp;base64,UklGRg==",
        sourceColor: "#AABBCC",
      },
    };
    const red = await createSolidImage(8, 8, { r: 255, g: 0, b: 0, alpha: 1 });
    let readCount = 0;

    const result = await enrichPublishManifestWithPlaceholders({
      manifest,
      previousManifest,
      sourceAssets: manifest.frames[0]!.assets.map((asset) => ({
        id: asset.id,
        thumbUrl: `/groups/${asset.id}.png`,
      })),
      readThumbnail: async () => {
        readCount += 1;
        return red;
      },
    });

    expect(readCount).toBe(2);
    expect(result.stats.generated).toBe(2);
  });
});
