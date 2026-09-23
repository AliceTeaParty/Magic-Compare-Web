import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishCase } from "./publish-case";

const {
  caseFindUnique,
  caseUpdate,
  groupUpdate,
  groupFindFirst,
  readPublishedManifest,
  writePublishedManifest,
  enrichPublishManifestWithPlaceholders,
} = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  caseUpdate: vi.fn(),
  groupUpdate: vi.fn(),
  groupFindFirst: vi.fn(),
  readPublishedManifest: vi.fn(),
  writePublishedManifest: vi.fn(),
  enrichPublishManifestWithPlaceholders: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    case: {
      findUnique: caseFindUnique,
      update: caseUpdate,
    },
    group: {
      update: groupUpdate,
      findFirst: groupFindFirst,
    },
  },
}));

vi.mock("@/lib/server/storage/published-content", () => ({
  readPublishedManifest,
  writePublishedManifest,
}));

vi.mock("./publish-image-placeholders", () => ({
  enrichPublishManifestWithPlaceholders,
}));

vi.mock("@/lib/server/storage/internal-assets", () => ({
  resolvePublicInternalAssetUrl: (assetUrl: string) =>
    `https://assets.example.com/bucket${assetUrl}`,
  internalAssetPublicGroupBaseUrl: (storageRoot: string) =>
    `https://assets.example.com/bucket${storageRoot}`,
}));

describe("publishCase", () => {
  beforeEach(() => {
    caseFindUnique.mockReset();
    caseUpdate.mockReset();
    groupUpdate.mockReset();
    groupFindFirst.mockReset();
    readPublishedManifest.mockReset();
    writePublishedManifest.mockReset();
    enrichPublishManifestWithPlaceholders.mockReset();
    readPublishedManifest.mockResolvedValue(null);
    enrichPublishManifestWithPlaceholders.mockImplementation(
      async ({ manifest }: { manifest: unknown }) => ({
        manifest,
        stats: { generated: 2, reused: 0, failed: 0 },
      }),
    );
  });

  it("publishes legacy assets without blocking on storage revalidation", async () => {
    caseFindUnique.mockResolvedValue({
      id: "case-1",
      slug: "2026",
      title: "2026",
      subtitle: "",
      summary: "summary",
      tagsJson: "[]",
      publishedAt: null,
      groups: [
        {
          id: "group-1",
          slug: "test-example",
          storageRoot: "/groups/group-1",
          publicSlug: "2026--test-example",
          title: "Test Example",
          description: "",
          defaultMode: "before-after",
          tagsJson: "[]",
          isPublic: true,
          order: 0,
          frames: [
            {
              id: "frame-1",
              title: "Frame 1",
              caption: "",
              order: 0,
              isPublic: true,
              assets: [
                {
                  id: "asset-before",
                  kind: "before",
                  label: "Before",
                  imageUrl: "/internal-assets/2026/test-example/001/before.png",
                  thumbUrl: "/internal-assets/2026/test-example/001/thumb-before.png",
                  width: 1280,
                  height: 720,
                  note: "",
                  isPublic: true,
                  isPrimaryDisplay: true,
                },
                {
                  id: "asset-after",
                  kind: "after",
                  label: "After",
                  imageUrl: "/internal-assets/2026/test-example/001/after.png",
                  thumbUrl: "/internal-assets/2026/test-example/001/thumb-after.png",
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

    await publishCase("case-1");

    expect(writePublishedManifest).toHaveBeenCalledWith(
      "2026--test-example",
      expect.objectContaining({
        schemaVersion: 2,
        publicSlug: "2026--test-example",
        assetBasePath: "https://assets.example.com/bucket/groups/group-1",
        frames: [
          expect.objectContaining({
            assets: [
              expect.objectContaining({
                imageUrl:
                  "https://assets.example.com/bucket/internal-assets/2026/test-example/001/before.png",
                thumbUrl:
                  "https://assets.example.com/bucket/internal-assets/2026/test-example/001/thumb-before.png",
              }),
              expect.objectContaining({
                imageUrl:
                  "https://assets.example.com/bucket/internal-assets/2026/test-example/001/after.png",
                thumbUrl:
                  "https://assets.example.com/bucket/internal-assets/2026/test-example/001/thumb-after.png",
              }),
            ],
          }),
        ],
      }),
    );
    expect(readPublishedManifest).toHaveBeenCalledWith("2026--test-example");
    expect(enrichPublishManifestWithPlaceholders).toHaveBeenCalledWith(
      expect.objectContaining({
        previousManifest: null,
        sourceAssets: expect.arrayContaining([
          expect.objectContaining({ id: "asset-before" }),
          expect.objectContaining({ id: "asset-after" }),
        ]),
      }),
    );
  });
});
