import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getRuntimeInternalAssetRoot,
  resolveExistingInternalAssetFile,
  resolveLegacyInternalAssetFile,
  resolveRuntimeInternalAssetFile,
} from "./internal-assets";

const runtimeTestRoot = path.join(getRuntimeInternalAssetRoot(), "__tests__");
const legacyTestRoot = path.join(process.cwd(), "public", "internal-assets", "__tests__");

afterEach(async () => {
  await rm(runtimeTestRoot, { recursive: true, force: true });
  await rm(legacyTestRoot, { recursive: true, force: true });
});

describe("internal asset storage helpers", () => {
  it("prefers runtime assets over legacy public assets", async () => {
    const assetUrl = "/internal-assets/__tests__/runtime-first.png";
    const runtimeFile = resolveRuntimeInternalAssetFile(assetUrl);
    const legacyFile = resolveLegacyInternalAssetFile(assetUrl);

    await mkdir(path.dirname(runtimeFile), { recursive: true });
    await mkdir(path.dirname(legacyFile), { recursive: true });
    await writeFile(runtimeFile, "runtime");
    await writeFile(legacyFile, "legacy");

    await expect(resolveExistingInternalAssetFile(assetUrl)).resolves.toBe(runtimeFile);
  });

  it("falls back to the legacy public path", async () => {
    const assetUrl = "/internal-assets/__tests__/legacy-only.png";
    const legacyFile = resolveLegacyInternalAssetFile(assetUrl);

    await mkdir(path.dirname(legacyFile), { recursive: true });
    await writeFile(legacyFile, "legacy");

    await expect(resolveExistingInternalAssetFile(assetUrl)).resolves.toBe(legacyFile);
  });

  it("rejects path traversal", async () => {
    await expect(
      resolveExistingInternalAssetFile("/internal-assets/__tests__/../escape.png"),
    ).rejects.toThrow(/Invalid internal asset path/);
  });
});
