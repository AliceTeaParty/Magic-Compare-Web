import { describe, expect, it } from "vitest";
import type { PublishManifest } from "@magic-compare/content-schema";
import {
  buildPublicShareImageData,
  buildPublicShareImagePath,
  PUBLIC_SHARE_IMAGE_HEIGHT,
  PUBLIC_SHARE_IMAGE_WIDTH,
} from "./share-image-data";

function createManifest(): PublishManifest {
  return {
    schemaVersion: 1,
    publicSlug: "case--group",
    generatedAt: "2026-08-07T00:00:00.000Z",
    assetBasePath: "/published/groups/case--group",
    case: {
      slug: "case",
      title: "2026",
      subtitle: "",
      summary: "Case 摘要不应进入分享图。",
      tags: [],
      publishedAt: "2026-08-07T00:00:00.000Z",
    },
    group: {
      id: "group-1",
      slug: "group",
      publicSlug: "case--group",
      title: "随机",
      description: "Imported from 随机.",
      defaultMode: "before-after",
      tags: [],
    },
    frames: [
      {
        id: "frame-later",
        title: "Later",
        caption: "",
        order: 2,
        assets: [
          {
            id: "later-before",
            kind: "before",
            label: "Later Before",
            imageUrl: "https://assets.example.com/later-before.png",
            thumbUrl: "https://assets.example.com/later-before-thumb.png",
            width: 800,
            height: 600,
            note: "",
            isPrimaryDisplay: true,
          },
          {
            id: "later-after",
            kind: "after",
            label: "Later After",
            imageUrl: "https://assets.example.com/later-after.png",
            thumbUrl: "https://assets.example.com/later-after-thumb.png",
            width: 800,
            height: 600,
            note: "",
            isPrimaryDisplay: true,
          },
        ],
      },
      {
        id: "frame-first",
        title: "First",
        caption: "",
        order: 0,
        assets: [
          {
            id: "first-after",
            kind: "after",
            label: "Processed",
            imageUrl: "https://assets.example.com/first-after.png",
            thumbUrl: "https://assets.example.com/first-after-thumb.png",
            width: 800,
            height: 600,
            note: "",
            isPrimaryDisplay: true,
          },
          {
            id: "first-before",
            kind: "before",
            label: "Source",
            imageUrl: "https://assets.example.com/first-before.png",
            thumbUrl: "https://assets.example.com/first-before-thumb.png",
            width: 800,
            height: 600,
            note: "",
            isPrimaryDisplay: true,
          },
        ],
      },
    ],
  };
}

describe("public share image data", () => {
  it("uses the first ordered frame and group-authored copy", () => {
    const data = buildPublicShareImageData(createManifest());

    expect(data).toMatchObject({
      title: "随机 - 2026",
      countLabel: "2 Groups",
      description: "Imported from 随机.",
      alt: "随机 - 2026，2 Groups 图像对比",
      leftAsset: { id: "first-before", label: "Source" },
      rightAsset: { id: "first-after", label: "Processed" },
    });
  });

  it("exposes one stable 1200 by 630 URL for each public group", () => {
    expect(buildPublicShareImagePath("case--group")).toBe(
      "/published/groups/case--group/share.jpg",
    );
    expect([PUBLIC_SHARE_IMAGE_WIDTH, PUBLIC_SHARE_IMAGE_HEIGHT]).toEqual([1200, 630]);
  });
});
