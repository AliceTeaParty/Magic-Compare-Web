import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshPublishedManifests } from "./refresh-published-manifests";

const mocks = vi.hoisted(() => ({
  groupFindMany: vi.fn(),
  caseUpdate: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  buildPublishManifest: vi.fn(),
  readPublishedManifest: vi.fn(),
  enrichPublishManifestWithPlaceholders: vi.fn(),
  writePublishedManifest: vi.fn(),
  parsePublishManifest: vi.fn(),
}));

vi.mock("../lib/server/db/client", () => ({
  prisma: {
    group: { findMany: mocks.groupFindMany },
    case: { update: mocks.caseUpdate },
    $disconnect: vi.fn(),
  },
}));

vi.mock("../lib/server/publish/build-publish-manifest", () => ({
  buildPublishManifest: mocks.buildPublishManifest,
}));

vi.mock("../lib/server/publish/publish-image-placeholders", () => ({
  enrichPublishManifestWithPlaceholders: mocks.enrichPublishManifestWithPlaceholders,
}));

vi.mock("../lib/server/storage/published-content", () => ({
  readPublishedManifest: mocks.readPublishedManifest,
  writePublishedManifest: mocks.writePublishedManifest,
}));

vi.mock("../lib/server/runtime-config", () => ({
  getPublishedRoot: () => "/published",
}));

vi.mock("node:fs/promises", () => ({
  readdir: mocks.readdir,
  readFile: mocks.readFile,
  rm: mocks.rm,
}));

vi.mock("@magic-compare/content-schema", () => ({
  parsePublishManifest: mocks.parsePublishManifest,
}));

describe("refreshPublishedManifests", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.groupFindMany.mockResolvedValue([
      {
        id: "group-1",
        publicSlug: "2026--published-group",
        case: { slug: "2026", publishedAt: new Date("2026-09-01T00:00:00.000Z") },
        frames: [{ assets: [{ id: "asset-1" }] }],
      },
    ]);
    mocks.readdir.mockResolvedValue([]);
    mocks.readPublishedManifest.mockResolvedValue(null);
    mocks.parsePublishManifest.mockImplementation((manifest: unknown) => manifest);
    mocks.buildPublishManifest.mockImplementation((params: unknown) => params);
    mocks.enrichPublishManifestWithPlaceholders.mockImplementation(
      async ({ manifest }: { manifest: unknown }) => ({ manifest }),
    );
    mocks.writePublishedManifest.mockResolvedValue(undefined);
    mocks.rm.mockResolvedValue(undefined);
  });

  it("rewrites existing public slugs without updating publication state", async () => {
    await expect(refreshPublishedManifests()).resolves.toEqual({
      refreshedCount: 1,
      refreshed: [{ publicSlug: "2026--published-group", caseSlug: "2026" }],
      prunedPublicSlugs: [],
      skippedUnidentifiedDirectories: [],
    });

    expect(mocks.groupFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          case: { status: "published" },
          isPublic: true,
          publicSlug: { not: null },
          frames: { some: { isPublic: true } },
        },
      }),
    );
    expect(mocks.writePublishedManifest).toHaveBeenCalledWith(
      "2026--published-group",
      expect.anything(),
    );
    expect(mocks.caseUpdate).not.toHaveBeenCalled();
  });

  it("prunes only identified stale manifests and preserves unidentified directories", async () => {
    mocks.groupFindMany.mockResolvedValue([
      {
        id: "group-1",
        publicSlug: "2026--published-group",
        case: { slug: "2026", publishedAt: new Date("2026-09-01T00:00:00.000Z") },
        frames: [{ assets: [{ id: "asset-1" }] }],
      },
    ]);
    mocks.readdir.mockResolvedValue([
      { name: "2026--published-group", isDirectory: () => true },
      { name: "former-internal-group", isDirectory: () => true },
      { name: "unidentified", isDirectory: () => true },
    ]);
    mocks.readFile.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith("/unidentified/manifest.json")) {
        throw new Error("manifest missing");
      }
      if (filePath.endsWith("/former-internal-group/manifest.json")) {
        return JSON.stringify({
          publicSlug: "former-internal-group",
          case: { slug: "former-internal-case" },
          group: { id: "group-2", publicSlug: "former-internal-group" },
        });
      }
      return JSON.stringify({
        publicSlug: "2026--published-group",
        case: { slug: "2026" },
        group: { id: "group-1", publicSlug: "2026--published-group" },
      });
    });

    await expect(refreshPublishedManifests()).resolves.toMatchObject({
      refreshedCount: 1,
      prunedPublicSlugs: ["former-internal-group"],
      skippedUnidentifiedDirectories: ["unidentified"],
    });
    expect(mocks.rm).toHaveBeenCalledTimes(1);
    expect(mocks.rm).toHaveBeenCalledWith("/published/groups/former-internal-group", {
      recursive: true,
      force: true,
    });
  });
});
