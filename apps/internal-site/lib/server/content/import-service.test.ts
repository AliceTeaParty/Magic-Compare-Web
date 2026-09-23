import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyImportManifest } from "./import-service";

const {
  validateImportManifest,
  assertLikelyImportManifestAssets,
  generateAssetPlaceholderJson,
  validateAndGenerateAssetPlaceholderJson,
  caseUpsert,
  caseUpdate,
  groupFindUnique,
  groupCreate,
  frameCreate,
  assetCreate,
} = vi.hoisted(() => ({
  validateImportManifest: vi.fn(),
  assertLikelyImportManifestAssets: vi.fn(),
  generateAssetPlaceholderJson: vi.fn(),
  validateAndGenerateAssetPlaceholderJson: vi.fn(),
  caseUpsert: vi.fn(),
  caseUpdate: vi.fn(),
  groupFindUnique: vi.fn(),
  groupCreate: vi.fn(),
  frameCreate: vi.fn(),
  assetCreate: vi.fn(),
}));

vi.mock("@/lib/server/validators/import-manifest", () => ({
  validateImportManifest,
}));

vi.mock("@/lib/server/storage/internal-asset-sanity", () => ({
  assertLikelyImportManifestAssets,
  isKeyCompareAssetKind: (kind: string) => kind === "before" || kind === "after",
}));

vi.mock("@/lib/server/storage/asset-placeholders", () => ({
  generateAssetPlaceholderJson,
  validateAndGenerateAssetPlaceholderJson,
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    case: {
      upsert: caseUpsert,
      update: caseUpdate,
    },
    group: {
      findUnique: groupFindUnique,
      create: groupCreate,
      update: vi.fn(),
    },
    frame: {
      create: frameCreate,
      deleteMany: vi.fn(),
    },
    asset: {
      create: assetCreate,
      deleteMany: vi.fn(),
    },
  },
}));

describe("applyImportManifest", () => {
  beforeEach(() => {
    validateImportManifest.mockReset();
    assertLikelyImportManifestAssets.mockReset();
    generateAssetPlaceholderJson.mockReset();
    validateAndGenerateAssetPlaceholderJson.mockReset();
    caseUpsert.mockReset();
    caseUpdate.mockReset();
    groupFindUnique.mockReset();
    groupCreate.mockReset();
    frameCreate.mockReset();
    assetCreate.mockReset();
  });

  it("stops before touching prisma when sanity check fails", async () => {
    validateImportManifest.mockReturnValue({
      case: {
        slug: "2026",
        title: "2026",
        subtitle: "",
        summary: "",
        tags: [],
        status: "internal",
        coverAssetLabel: "After",
      },
      groups: [],
    });
    assertLikelyImportManifestAssets.mockRejectedValue(new Error("bad asset"));

    await expect(applyImportManifest({})).rejects.toThrow("bad asset");
    expect(caseUpsert).not.toHaveBeenCalled();
  });

  it("derives independent previews concurrently before replacing imported rows", async () => {
    validateImportManifest.mockReturnValue({
      case: {
        slug: "2026",
        title: "2026",
        subtitle: "",
        summary: "",
        tags: [],
        status: "internal",
        coverAssetLabel: "",
      },
      groups: [
        {
          group: {
            slug: "pair",
            title: "Pair",
            description: "",
            order: 0,
            isPublic: false,
            tags: [],
          },
          frames: [
            {
              frame: { title: "Frame", caption: "", order: 0, isPublic: true },
              assets: [
                {
                  kind: "before",
                  label: "Before",
                  imageUrl: "groups/pair/1/o1.webp",
                  thumbUrl: "groups/pair/1/t1.webp",
                  width: 16,
                  height: 16,
                  note: "",
                  isPublic: true,
                  isPrimaryDisplay: true,
                },
                {
                  kind: "after",
                  label: "After",
                  imageUrl: "groups/pair/1/o2.webp",
                  thumbUrl: "groups/pair/1/t2.webp",
                  width: 16,
                  height: 16,
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
    assertLikelyImportManifestAssets.mockResolvedValue(undefined);
    const pending = new Map<string, (value: string) => void>();
    validateAndGenerateAssetPlaceholderJson.mockImplementation(
      (thumbUrl: string) =>
        new Promise<string>((resolve) => {
          pending.set(thumbUrl, resolve);
        }),
    );
    caseUpsert.mockResolvedValue({ id: "case-1", slug: "2026" });
    groupFindUnique.mockResolvedValue(null);
    groupCreate.mockResolvedValue({ id: "group-1", storageRoot: "groups/pair" });
    frameCreate.mockResolvedValue({ id: "frame-1" });
    assetCreate.mockResolvedValueOnce({ id: "asset-1" }).mockResolvedValueOnce({ id: "asset-2" });
    caseUpdate.mockResolvedValue({});

    const importPromise = applyImportManifest({});
    await vi.waitFor(() => expect(pending.size).toBe(2));
    expect(caseUpsert).not.toHaveBeenCalled();
    pending.get("groups/pair/1/t1.webp")?.("before-preview");
    pending.get("groups/pair/1/t2.webp")?.("after-preview");
    await importPromise;

    expect(assetCreate.mock.calls.map(([call]) => call.data.imagePlaceholderJson)).toEqual([
      "before-preview",
      "after-preview",
    ]);
  });
});
