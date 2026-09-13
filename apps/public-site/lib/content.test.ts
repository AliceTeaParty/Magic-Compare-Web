import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublishedManifest, listPublishedGroupSlugs } from "./content";
import { buildPublishManifestFixture } from "./publish-manifest.test-fixture";

const { readdir, readFile, isHiddenDemoCaseSlug, getPublishedGroupsRoot } = vi.hoisted(() => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  isHiddenDemoCaseSlug: vi.fn(),
  getPublishedGroupsRoot: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readdir, readFile }));
vi.mock("@/lib/runtime-config", () => ({ isHiddenDemoCaseSlug, getPublishedGroupsRoot }));

describe("public published content helpers", () => {
  beforeEach(() => {
    readdir.mockReset();
    readFile.mockReset();
    isHiddenDemoCaseSlug.mockReset();
    getPublishedGroupsRoot.mockReset();
    isHiddenDemoCaseSlug.mockReturnValue(false);
    getPublishedGroupsRoot.mockReturnValue("/tmp/published/groups");
  });

  it("lists only directories with valid manifests in stable order", async () => {
    readdir.mockResolvedValue([
      { isDirectory: () => true, name: "group-b" },
      { isDirectory: () => true, name: "group-a" },
      { isDirectory: () => true, name: "invalid" },
      { isDirectory: () => false, name: "ignore.txt" },
    ]);
    readFile.mockImplementation(async (filePath: string) => {
      const publicSlug = filePath.includes("group-a") ? "group-a" : "group-b";
      if (filePath.includes("invalid")) {
        return JSON.stringify({ schemaVersion: 1 });
      }
      return JSON.stringify(buildPublishManifestFixture({ publicSlug, groupSlug: publicSlug }));
    });

    await expect(listPublishedGroupSlugs()).resolves.toEqual(["group-a", "group-b"]);
  });

  it("skips manifests hidden by the demo-content policy", async () => {
    readdir.mockResolvedValue([
      { isDirectory: () => true, name: "demo-grain-study--banding-check" },
      { isDirectory: () => true, name: "real-case--group-a" },
    ]);
    readFile.mockImplementation(async (filePath: string) =>
      JSON.stringify(
        filePath.includes("demo-grain-study")
          ? buildPublishManifestFixture({
              caseSlug: "demo-grain-study",
              groupSlug: "banding-check",
            })
          : buildPublishManifestFixture({ caseSlug: "real-case", groupSlug: "group-a" }),
      ),
    );
    isHiddenDemoCaseSlug.mockImplementation((slug: string) => slug === "demo-grain-study");

    await expect(listPublishedGroupSlugs()).resolves.toEqual(["real-case--group-a"]);
  });

  it("returns null for a hidden demo manifest", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(
        buildPublishManifestFixture({
          caseSlug: "demo-grain-study",
          groupSlug: "banding-check",
        }),
      ),
    );
    isHiddenDemoCaseSlug.mockReturnValue(true);

    await expect(getPublishedManifest("demo-grain-study--banding-check")).resolves.toBeNull();
  });

  it.each(["{", JSON.stringify({ schemaVersion: 1 })])(
    "returns null for invalid manifest content",
    async (contents) => {
      readFile.mockResolvedValue(contents);

      await expect(getPublishedManifest("broken-group")).resolves.toBeNull();
    },
  );
});
