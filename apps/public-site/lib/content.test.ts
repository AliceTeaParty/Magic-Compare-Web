import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPublishedGroupRouteAlias,
  getPublishedManifest,
  listPublishedGroupRouteAliases,
  listPublishedGroupSlugs,
} from "./content";

const {
  readdir,
  readFile,
  shouldHideDemoContent,
  isHiddenDemoCaseSlug,
  getPublishedGroupsRoot,
} = vi.hoisted(() => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  shouldHideDemoContent: vi.fn(),
  isHiddenDemoCaseSlug: vi.fn(),
  getPublishedGroupsRoot: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readdir,
  readFile,
}));

vi.mock("@/lib/runtime-config", () => ({
  shouldHideDemoContent,
  isHiddenDemoCaseSlug,
  getPublishedGroupsRoot,
}));

describe("public published content helpers", () => {
  beforeEach(() => {
    readdir.mockReset();
    readFile.mockReset();
    shouldHideDemoContent.mockReset();
    isHiddenDemoCaseSlug.mockReset();
    getPublishedGroupsRoot.mockReset();
    shouldHideDemoContent.mockReturnValue(false);
    isHiddenDemoCaseSlug.mockReturnValue(false);
    getPublishedGroupsRoot.mockReturnValue("/tmp/published/groups");
  });

  it("lists published slugs directly when demo hiding is disabled", async () => {
    readdir.mockResolvedValue([
      { isDirectory: () => true, name: "group-b" },
      { isDirectory: () => true, name: "group-a" },
      { isDirectory: () => false, name: "ignore.txt" },
    ]);
    readFile.mockImplementation(async (filePath: string) => {
      const publicSlug = filePath.includes("group-a") ? "group-a" : "group-b";
      const groupSlug = publicSlug === "group-a" ? "group-a" : "group-b";

      return JSON.stringify({
        schemaVersion: 1,
        publicSlug,
        generatedAt: "2026-03-20T00:00:00.000Z",
        assetBasePath: `/published/groups/${publicSlug}/assets`,
        case: {
          slug: "2026",
          title: "2026",
          subtitle: "",
          summary: "",
          tags: [],
          publishedAt: "2026-03-20T00:00:00.000Z",
        },
        group: {
          id: `group-${groupSlug}`,
          slug: groupSlug,
          publicSlug,
          title: groupSlug,
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
            assets: [
              {
                id: "asset-1",
                kind: "before",
                label: "Before",
                imageUrl: `/published/groups/${publicSlug}/assets/a.png`,
                thumbUrl: `/published/groups/${publicSlug}/assets/a.png`,
                width: 1280,
                height: 720,
                note: "",
                isPrimaryDisplay: true,
              },
              {
                id: "asset-2",
                kind: "after",
                label: "After",
                imageUrl: `/published/groups/${publicSlug}/assets/b.png`,
                thumbUrl: `/published/groups/${publicSlug}/assets/b.png`,
                width: 1280,
                height: 720,
                note: "",
                isPrimaryDisplay: true,
              },
            ],
          },
        ],
      });
    });

    await expect(listPublishedGroupSlugs()).resolves.toEqual(["group-a", "group-b"]);
  });

  it("skips demo bundles when demo hiding is enabled", async () => {
    shouldHideDemoContent.mockReturnValue(true);
    readdir.mockResolvedValue([
      { isDirectory: () => true, name: "demo-grain-study--banding-check" },
      { isDirectory: () => true, name: "real-case--group-a" },
    ]);
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes("demo-grain-study--banding-check")) {
        return JSON.stringify({
          schemaVersion: 1,
          publicSlug: "demo-grain-study--banding-check",
          generatedAt: "2026-03-20T00:00:00.000Z",
          assetBasePath: "/published/groups/demo-grain-study--banding-check/assets",
          case: {
            slug: "demo-grain-study",
            title: "Demo Grain Study",
            subtitle: "",
            summary: "",
            tags: [],
            publishedAt: "2026-03-20T00:00:00.000Z",
          },
          group: {
            id: "group-demo",
            slug: "banding-check",
            publicSlug: "demo-grain-study--banding-check",
            title: "Banding Check",
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
              assets: [
                {
                  id: "asset-1",
                  kind: "before",
                  label: "Before",
                  imageUrl: "/published/groups/demo-grain-study--banding-check/assets/a.png",
                  thumbUrl: "/published/groups/demo-grain-study--banding-check/assets/a.png",
                  width: 1280,
                  height: 720,
                  note: "",
                  isPrimaryDisplay: true,
                },
                {
                  id: "asset-2",
                  kind: "after",
                  label: "After",
                  imageUrl: "/published/groups/demo-grain-study--banding-check/assets/b.png",
                  thumbUrl: "/published/groups/demo-grain-study--banding-check/assets/b.png",
                  width: 1280,
                  height: 720,
                  note: "",
                  isPrimaryDisplay: true,
                },
              ],
            },
          ],
        });
      }

      return JSON.stringify({
        schemaVersion: 1,
        publicSlug: "real-case--group-a",
        generatedAt: "2026-03-20T00:00:00.000Z",
        assetBasePath: "/published/groups/real-case--group-a/assets",
        case: {
          slug: "2026",
          title: "2026",
          subtitle: "",
          summary: "",
          tags: [],
          publishedAt: "2026-03-20T00:00:00.000Z",
        },
        group: {
          id: "group-real",
          slug: "group-a",
          publicSlug: "real-case--group-a",
          title: "Group A",
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
            assets: [
              {
                id: "asset-1",
                kind: "before",
                label: "Before",
                imageUrl: "/published/groups/real-case--group-a/assets/a.png",
                thumbUrl: "/published/groups/real-case--group-a/assets/a.png",
                width: 1280,
                height: 720,
                note: "",
                isPrimaryDisplay: true,
              },
              {
                id: "asset-2",
                kind: "after",
                label: "After",
                imageUrl: "/published/groups/real-case--group-a/assets/b.png",
                thumbUrl: "/published/groups/real-case--group-a/assets/b.png",
                width: 1280,
                height: 720,
                note: "",
                isPrimaryDisplay: true,
              },
            ],
          },
        ],
      });
    });
    isHiddenDemoCaseSlug.mockImplementation((slug: string) => slug === "demo-grain-study");

    await expect(listPublishedGroupSlugs()).resolves.toEqual(["real-case--group-a"]);
  });

  it("returns null for a hidden demo manifest", async () => {
    readFile.mockResolvedValue(
      JSON.stringify({
        schemaVersion: 1,
        publicSlug: "demo-grain-study--banding-check",
        generatedAt: "2026-03-20T00:00:00.000Z",
        assetBasePath: "/published/groups/demo-grain-study--banding-check/assets",
        case: {
          slug: "demo-grain-study",
          title: "Demo Grain Study",
          subtitle: "",
          summary: "",
          tags: [],
          publishedAt: "2026-03-20T00:00:00.000Z",
        },
        group: {
          id: "group-demo",
          slug: "banding-check",
          publicSlug: "demo-grain-study--banding-check",
          title: "Banding Check",
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
            assets: [
              {
                id: "asset-1",
                kind: "before",
                label: "Before",
                imageUrl: "/published/groups/demo-grain-study--banding-check/assets/a.png",
                thumbUrl: "/published/groups/demo-grain-study--banding-check/assets/a.png",
                width: 1280,
                height: 720,
                note: "",
                isPrimaryDisplay: true,
              },
              {
                id: "asset-2",
                kind: "after",
                label: "After",
                imageUrl: "/published/groups/demo-grain-study--banding-check/assets/b.png",
                thumbUrl: "/published/groups/demo-grain-study--banding-check/assets/b.png",
                width: 1280,
                height: 720,
                note: "",
                isPrimaryDisplay: true,
              },
            ],
          },
        ],
      }),
    );
    isHiddenDemoCaseSlug.mockReturnValue(true);

    await expect(getPublishedManifest("demo-grain-study--banding-check")).resolves.toBeNull();
  });

  it("builds route aliases from published manifests", async () => {
    readdir.mockResolvedValue([{ isDirectory: () => true, name: "demo-grain-study--banding-check" }]);
    readFile.mockResolvedValue(
      JSON.stringify({
        schemaVersion: 1,
        publicSlug: "demo-grain-study--banding-check",
        generatedAt: "2026-03-20T00:00:00.000Z",
        assetBasePath: "/published/groups/demo-grain-study--banding-check/assets",
        case: {
          slug: "demo-grain-study",
          title: "Demo Grain Study",
          subtitle: "",
          summary: "",
          tags: [],
          publishedAt: "2026-03-20T00:00:00.000Z",
        },
        group: {
          id: "group-demo",
          slug: "banding-check",
          publicSlug: "demo-grain-study--banding-check",
          title: "Banding Check",
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
            assets: [
              {
                id: "asset-1",
                kind: "before",
                label: "Before",
                imageUrl: "/published/groups/demo-grain-study--banding-check/assets/a.png",
                thumbUrl: "/published/groups/demo-grain-study--banding-check/assets/a.png",
                width: 1280,
                height: 720,
                note: "",
                isPrimaryDisplay: true,
              },
              {
                id: "asset-2",
                kind: "after",
                label: "After",
                imageUrl: "/published/groups/demo-grain-study--banding-check/assets/b.png",
                thumbUrl: "/published/groups/demo-grain-study--banding-check/assets/b.png",
                width: 1280,
                height: 720,
                note: "",
                isPrimaryDisplay: true,
              },
            ],
          },
        ],
      }),
    );

    await expect(listPublishedGroupRouteAliases()).resolves.toEqual([
      {
        caseSlug: "demo-grain-study",
        groupSlug: "banding-check",
        publicSlug: "demo-grain-study--banding-check",
      },
    ]);
    await expect(getPublishedGroupRouteAlias("demo-grain-study", "banding-check")).resolves.toEqual({
      caseSlug: "demo-grain-study",
      groupSlug: "banding-check",
      publicSlug: "demo-grain-study--banding-check",
    });
  });
});
