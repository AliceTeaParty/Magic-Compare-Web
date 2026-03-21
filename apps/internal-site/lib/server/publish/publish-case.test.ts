import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishCase } from "./publish-case";

const { caseFindUnique, caseUpdate, groupUpdate, groupFindFirst, writePublishedManifest, resetPublishedGroup } =
  vi.hoisted(() => ({
    caseFindUnique: vi.fn(),
    caseUpdate: vi.fn(),
    groupUpdate: vi.fn(),
    groupFindFirst: vi.fn(),
    writePublishedManifest: vi.fn(),
    resetPublishedGroup: vi.fn(),
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
  resetPublishedGroup,
  writePublishedManifest,
}));

vi.mock("@/lib/server/storage/internal-assets", () => ({
  resolvePublicInternalAssetUrl: (assetUrl: string) => `https://assets.example.com/bucket${assetUrl}`,
  internalAssetPublicGroupBaseUrl: (caseSlug: string, groupSlug: string) =>
    `https://assets.example.com/bucket/internal-assets/${caseSlug}/${groupSlug}`,
}));

describe("publishCase", () => {
  beforeEach(() => {
    caseFindUnique.mockReset();
    caseUpdate.mockReset();
    groupUpdate.mockReset();
    groupFindFirst.mockReset();
    writePublishedManifest.mockReset();
    resetPublishedGroup.mockReset();
  });

  it("writes manifest-only published bundles with public asset urls", async () => {
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

    expect(resetPublishedGroup).toHaveBeenCalledWith("2026--test-example");
    expect(writePublishedManifest).toHaveBeenCalledWith(
      "2026--test-example",
      expect.objectContaining({
        schemaVersion: 1,
        publicSlug: "2026--test-example",
        assetBasePath: "https://assets.example.com/bucket/internal-assets/2026/test-example",
        frames: [
          expect.objectContaining({
            assets: [
              expect.objectContaining({
                imageUrl: "https://assets.example.com/bucket/internal-assets/2026/test-example/001/before.png",
                thumbUrl:
                  "https://assets.example.com/bucket/internal-assets/2026/test-example/001/thumb-before.png",
              }),
              expect.objectContaining({
                imageUrl: "https://assets.example.com/bucket/internal-assets/2026/test-example/001/after.png",
                thumbUrl:
                  "https://assets.example.com/bucket/internal-assets/2026/test-example/001/thumb-after.png",
              }),
            ],
          }),
        ],
      }),
    );
  });
});
