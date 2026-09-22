import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testPaths = vi.hoisted(() => ({
  publishedGroupsDirectory: "",
  workspaceRoot: "",
}));

vi.mock("./paths", () => ({
  getWorkspaceRoot: () => testPaths.workspaceRoot,
  publishedGroupsDirectory: () => testPaths.publishedGroupsDirectory,
}));

import { computePublicDeploymentFingerprint } from "./deployment-fingerprint";

const temporaryRoots: string[] = [];
const sourceFiles = [
  "apps/build-metadata.mjs",
  "apps/public-site/app/page.tsx",
  "apps/public-site/scripts/generate-share-images.tsx",
  "apps/public-site/public/default-apple-icon.png",
  "apps/public-site/public/default-favicon.ico",
  "apps/public-site/public/default-icon.png",
  "apps/public-site/tsconfig.json",
  "apps/internal-site/tsconfig.json",
  "package.json",
  "packages/compare-core/package.json",
  "packages/content-schema/package.json",
  "packages/shared-utils/package.json",
  "packages/ui/package.json",
  "patches/material-color-utilities@0.4.0.patch",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
] as const;
const environmentKeys = [
  "MAGIC_COMPARE_CF_PAGES_BRANCH",
  "MAGIC_COMPARE_CF_PAGES_PROJECT_NAME",
  "MAGIC_COMPARE_S3_INTERNAL_PREFIX",
  "MAGIC_COMPARE_S3_PUBLIC_BASE_URL",
] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
);

async function writeFixtureFile(
  root: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const targetPath = path.join(root, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, contents);
}

beforeEach(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "magic-compare-deployment-fingerprint-"));
  temporaryRoots.push(root);
  testPaths.workspaceRoot = root;
  testPaths.publishedGroupsDirectory = path.join(root, "published", "groups");
  await mkdir(testPaths.publishedGroupsDirectory, { recursive: true });
  await Promise.all(
    sourceFiles.map((relativePath) => writeFixtureFile(root, relativePath, "before\n")),
  );

  process.env.MAGIC_COMPARE_CF_PAGES_PROJECT_NAME = "magic-compare-public";
  process.env.MAGIC_COMPARE_CF_PAGES_BRANCH = "main";
  process.env.MAGIC_COMPARE_S3_PUBLIC_BASE_URL = "https://assets.example.com/bucket/";
  process.env.MAGIC_COMPARE_S3_INTERNAL_PREFIX = "internal-assets/";
});

afterEach(async () => {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("public deployment fingerprint", () => {
  it("is stable while public inputs are unchanged", async () => {
    const first = await computePublicDeploymentFingerprint();

    await expect(computePublicDeploymentFingerprint()).resolves.toBe(first);
  });

  it.each(sourceFiles)("changes when the public build input %s changes", async (relativePath) => {
    const before = await computePublicDeploymentFingerprint();
    await writeFixtureFile(testPaths.workspaceRoot, relativePath, "after\n");

    await expect(computePublicDeploymentFingerprint()).resolves.not.toBe(before);
  });

  it("changes when sync-published rewrites the public asset base URL", async () => {
    const before = await computePublicDeploymentFingerprint();
    process.env.MAGIC_COMPARE_S3_PUBLIC_BASE_URL = "https://cdn.example.com/bucket/";

    await expect(computePublicDeploymentFingerprint()).resolves.not.toBe(before);
  });

  it("changes when sync-published rewrites the internal object prefix", async () => {
    const before = await computePublicDeploymentFingerprint();
    process.env.MAGIC_COMPARE_S3_INTERNAL_PREFIX = "next-prefix/";

    await expect(computePublicDeploymentFingerprint()).resolves.not.toBe(before);
  });

  it("keeps sync-published URL normalization from causing a redundant deployment", async () => {
    const before = await computePublicDeploymentFingerprint();
    process.env.MAGIC_COMPARE_S3_PUBLIC_BASE_URL = "https://assets.example.com/bucket";
    process.env.MAGIC_COMPARE_S3_INTERNAL_PREFIX = "/internal-assets";

    await expect(computePublicDeploymentFingerprint()).resolves.toBe(before);
  });
});
