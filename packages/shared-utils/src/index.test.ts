import { describe, expect, it } from "vitest";
import {
  DEMO_CASE_SLUG,
  buildPublicGroupSlug,
  cjkKebabCase,
  kebabCase,
  parseEnvFlag,
  resolveFooterConfig,
} from "./index";

describe("shared slug helpers", () => {
  it("normalizes general slugs with kebabCase", () => {
    expect(kebabCase(" Demo Grain Study ")).toBe("demo-grain-study");
  });

  it("collapses repeated separators so public slug delimiters stay reserved", () => {
    expect(kebabCase("bad--case")).toBe("bad-case");
  });

  it("transliterates Chinese and kana before building upload slugs", () => {
    expect(cjkKebabCase("测试 Case")).toBe("ceshi-case");
    expect(cjkKebabCase("かな Upload")).toBe("kana-upload");
    expect(cjkKebabCase("  --  ", "uploaded-group")).toBe("uploaded-group");
  });

  it("preserves the double-hyphen separator for public group slugs", () => {
    expect(buildPublicGroupSlug("demo-grain-study", "banding-check")).toBe(
      "demo-grain-study--banding-check",
    );
  });

  it("exports the fixed demo case slug", () => {
    expect(DEMO_CASE_SLUG).toBe("demo-grain-study");
  });

  it("parses common truthy env flags", () => {
    expect(parseEnvFlag("true")).toBe(true);
    expect(parseEnvFlag("1")).toBe(true);
    expect(parseEnvFlag("on")).toBe(true);
    expect(parseEnvFlag("false")).toBe(false);
    expect(parseEnvFlag(undefined)).toBe(false);
  });

  it("passes build version and commit hash through footer config", () => {
    expect(
      resolveFooterConfig(
        {
          MAGIC_COMPARE_APP_VERSION: "1.9.1",
          MAGIC_COMPARE_COMMIT_SHA: "abc123",
        },
        2026,
      ),
    ).toMatchObject({
      appVersion: "1.9.1",
      commitHash: "abc123",
    });
  });

  it("keeps footer build metadata optional", () => {
    expect(resolveFooterConfig({}, 2026)).toMatchObject({
      appVersion: null,
      commitHash: null,
    });
  });
});
