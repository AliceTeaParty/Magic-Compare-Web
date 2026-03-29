import { describe, expect, it, vi } from "vitest";
import { buildPublishManifest } from "./build-publish-manifest";

const { resolvePublicInternalAssetUrl, internalAssetPublicGroupBaseUrl } =
  vi.hoisted(() => ({
    resolvePublicInternalAssetUrl: vi.fn((assetUrl: string) => `https://assets.example.com${assetUrl}`),
    internalAssetPublicGroupBaseUrl: vi.fn((storageRoot: string) => `https://assets.example.com${storageRoot}`),
  }));

vi.mock("@/lib/server/storage/internal-assets", () => ({
  resolvePublicInternalAssetUrl,
  internalAssetPublicGroupBaseUrl,
}));

describe("buildPublishManifest", () => {
  it("returns null when a public group has no public frames", () => {
    expect(
      buildPublishManifest({
        caseRow: {
          slug: "2026",
          title: "Case",
          subtitle: "",
          summary: "Summary",
          tagsJson: "[]",
        },
        group: {
          id: "group-1",
          slug: "group-1",
          storageRoot: "/groups/group-1",
          title: "Group 1",
          description: "",
          defaultMode: "before-after",
          tagsJson: "[]",
          frames: [],
        },
        publicSlug: "2026--group-1",
        publishedAt: new Date("2026-03-21T10:00:00.000Z"),
      }),
    ).toBeNull();
  });

  it("maps assets to published urls and manifest kinds", () => {
    const manifest = buildPublishManifest({
      caseRow: {
        slug: "2026",
        title: "Case",
        subtitle: "",
        summary: "Summary",
        tagsJson: JSON.stringify(["grain"]),
      },
      group: {
        id: "group-1",
        slug: "group-1",
        storageRoot: "/groups/group-1",
        title: "Group 1",
        description: "",
        defaultMode: "a-b",
        tagsJson: JSON.stringify(["demo"]),
        frames: [
          {
            id: "frame-1",
            title: "Frame 1",
            caption: "",
            order: 0,
            isPublic: true,
            assets: [
              {
                id: "before-1",
                kind: "before",
                label: "Before",
                imageUrl: "/internal-assets/2026/group-1/frame-1-before.png",
                thumbUrl:
                  "/internal-assets/2026/group-1/frame-1-before-thumb.png",
                width: 1920,
                height: 1080,
                note: "",
                isPublic: true,
                isPrimaryDisplay: true,
              },
              {
                id: "after-1",
                kind: "after",
                label: "After",
                imageUrl: "/internal-assets/2026/group-1/frame-1-after.png",
                thumbUrl:
                  "/internal-assets/2026/group-1/frame-1-after-thumb.png",
                width: 1920,
                height: 1080,
                note: "",
                isPublic: true,
                isPrimaryDisplay: true,
              },
              {
                id: "misc-1",
                kind: "other",
                label: "Debug",
                imageUrl: "/internal-assets/2026/group-1/frame-1-debug.png",
                thumbUrl:
                  "/internal-assets/2026/group-1/frame-1-debug-thumb.png",
                width: 640,
                height: 360,
                note: "",
                isPublic: true,
                isPrimaryDisplay: false,
              },
            ],
          },
        ],
      },
      publicSlug: "2026--group-1",
      publishedAt: new Date("2026-03-21T10:00:00.000Z"),
    });

    expect(manifest).toEqual(
      expect.objectContaining({
        publicSlug: "2026--group-1",
        assetBasePath: "https://assets.example.com/groups/group-1",
        case: expect.objectContaining({
          tags: ["grain"],
        }),
        group: expect.objectContaining({
          defaultMode: "a-b",
          tags: ["demo"],
        }),
        frames: [
          expect.objectContaining({
            assets: [
              expect.objectContaining({
                kind: "before",
                imageUrl:
                  "https://assets.example.com/internal-assets/2026/group-1/frame-1-before.png",
              }),
              expect.objectContaining({
                kind: "after",
                imageUrl:
                  "https://assets.example.com/internal-assets/2026/group-1/frame-1-after.png",
              }),
              expect.objectContaining({
                kind: "misc",
                imageUrl:
                  "https://assets.example.com/internal-assets/2026/group-1/frame-1-debug.png",
              }),
            ],
          }),
        ],
      }),
    );
  });

  it("rejects raw bucket hosts when publishing in production", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    resolvePublicInternalAssetUrl.mockImplementation(
      (assetUrl: string) => `https://bucket.example.r2.dev${assetUrl}`,
    );
    internalAssetPublicGroupBaseUrl.mockImplementation(
      (storageRoot: string) => `https://bucket.example.r2.dev${storageRoot}`,
    );

    expect(() =>
      buildPublishManifest({
        caseRow: {
          slug: "2026",
          title: "Case",
          subtitle: "",
          summary: "Summary",
          tagsJson: "[]",
        },
        group: {
          id: "group-1",
          slug: "group-1",
          storageRoot: "/groups/group-1",
          title: "Group 1",
          description: "",
          defaultMode: "before-after",
          tagsJson: "[]",
          frames: [
            {
              id: "frame-1",
              title: "Frame 1",
              caption: "",
              order: 0,
              isPublic: true,
              assets: [
                {
                  id: "before-1",
                  kind: "before",
                  label: "Before",
                  imageUrl: "/internal-assets/2026/group-1/frame-1-before.png",
                  thumbUrl:
                    "/internal-assets/2026/group-1/frame-1-before-thumb.png",
                  width: 1920,
                  height: 1080,
                  note: "",
                  isPublic: true,
                  isPrimaryDisplay: true,
                },
                {
                  id: "after-1",
                  kind: "after",
                  label: "After",
                  imageUrl: "/internal-assets/2026/group-1/frame-1-after.png",
                  thumbUrl:
                    "/internal-assets/2026/group-1/frame-1-after-thumb.png",
                  width: 1920,
                  height: 1080,
                  note: "",
                  isPublic: true,
                  isPrimaryDisplay: true,
                },
              ],
            },
          ],
        },
        publicSlug: "2026--group-1",
        publishedAt: new Date("2026-03-21T10:00:00.000Z"),
      }),
    ).toThrow(/Cloudflare-proxied public image hostname/);

    resolvePublicInternalAssetUrl.mockImplementation(
      (assetUrl: string) => `https://assets.example.com${assetUrl}`,
    );
    internalAssetPublicGroupBaseUrl.mockImplementation(
      (storageRoot: string) => `https://assets.example.com${storageRoot}`,
    );
    process.env.NODE_ENV = originalNodeEnv;
  });
});
