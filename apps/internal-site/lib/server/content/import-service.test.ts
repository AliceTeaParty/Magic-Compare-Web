import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyImportManifest } from "./import-service";

const { validateImportManifest, assertLikelyImportManifestAssets, caseUpsert } = vi.hoisted(() => ({
  validateImportManifest: vi.fn(),
  assertLikelyImportManifestAssets: vi.fn(),
  caseUpsert: vi.fn(),
}));

vi.mock("@/lib/server/validators/import-manifest", () => ({
  validateImportManifest,
}));

vi.mock("@/lib/server/storage/internal-asset-sanity", () => ({
  assertLikelyImportManifestAssets,
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    case: {
      upsert: caseUpsert,
    },
    group: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    frame: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    asset: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe("applyImportManifest", () => {
  beforeEach(() => {
    validateImportManifest.mockReset();
    assertLikelyImportManifestAssets.mockReset();
    caseUpsert.mockReset();
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
});
