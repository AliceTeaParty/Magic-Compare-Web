import { afterEach, describe, expect, it } from "vitest";
import {
  getPublicSiteBuildArgs,
  getWranglerPagesDeployArgs,
} from "./runtime";

const originalProjectName = process.env.MAGIC_COMPARE_CF_PAGES_PROJECT_NAME;
const originalBranch = process.env.MAGIC_COMPARE_CF_PAGES_BRANCH;

afterEach(() => {
  process.env.MAGIC_COMPARE_CF_PAGES_PROJECT_NAME = originalProjectName;
  process.env.MAGIC_COMPARE_CF_PAGES_BRANCH = originalBranch;
});

describe("public site runtime helpers", () => {
  it("returns the build command args for public static export", () => {
    expect(getPublicSiteBuildArgs()).toEqual(["--filter", "@magic-compare/public-site", "build"]);
  });

  it("builds wrangler deploy args with an optional branch", () => {
    process.env.MAGIC_COMPARE_CF_PAGES_PROJECT_NAME = "magic-compare-public";
    process.env.MAGIC_COMPARE_CF_PAGES_BRANCH = "main";

    expect(getWranglerPagesDeployArgs("/tmp/public-export")).toEqual([
      "exec",
      "wrangler",
      "pages",
      "deploy",
      "/tmp/public-export",
      "--project-name",
      "magic-compare-public",
      "--branch",
      "main",
    ]);
  });
});
