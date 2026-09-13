import { describe, expect, it } from "vitest";
import {
  DEMO_CASE_SLUG,
  buildPublicGroupSlug,
  cjkKebabCase,
  kebabCase,
  parseEnvFlag,
  resolveBuildIdentityConfig,
  resolveSiteBrandConfig,
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

  it("resolves build identity independently from footer content", () => {
    expect(
      resolveBuildIdentityConfig({
        MAGIC_COMPARE_APP_VERSION: " 1.9.1 ",
        MAGIC_COMPARE_COMMIT_SHA: " abc123 ",
      }),
    ).toEqual({
      appVersion: "1.9.1",
      commitHash: "abc123",
    });
    expect(resolveBuildIdentityConfig({})).toEqual({
      appVersion: null,
      commitHash: null,
    });
  });

  it("keeps internal and public brand assets independently configurable", () => {
    const env = {
      MAGIC_COMPARE_INTERNAL_FAVICON_URL: " /internal/favicon.svg ",
      MAGIC_COMPARE_INTERNAL_LOGO_URL: " /internal/logo.svg ",
      MAGIC_COMPARE_PUBLIC_FAVICON_URL: "https://assets.example.com/public.ico",
      MAGIC_COMPARE_PUBLIC_LOGO_URL: "https://assets.example.com/public.svg",
    };

    expect(resolveSiteBrandConfig(env, "internal")).toEqual({
      faviconUrl: "/internal/favicon.svg",
      logoUrl: "/internal/logo.svg",
    });
    expect(resolveSiteBrandConfig(env, "public")).toEqual({
      faviconUrl: "https://assets.example.com/public.ico",
      logoUrl: "https://assets.example.com/public.svg",
    });
    expect(resolveSiteBrandConfig({}, "public")).toEqual({
      faviconUrl: null,
      logoUrl: null,
    });
  });

  it("maps mounted branding file URLs to public paths and rejects private file paths", () => {
    expect(
      resolveSiteBrandConfig(
        {
          MAGIC_COMPARE_INTERNAL_FAVICON_URL: "file:///branding/internal-favicon.ico",
          MAGIC_COMPARE_INTERNAL_LOGO_URL: "file:/branding/internal-logo.webp",
        },
        "internal",
      ),
    ).toEqual({
      faviconUrl: "/branding/internal-favicon.ico",
      logoUrl: "/branding/internal-logo.webp",
    });
    expect(
      resolveSiteBrandConfig(
        {
          MAGIC_COMPARE_PUBLIC_FAVICON_URL: "file:/app/private/favicon.ico",
          MAGIC_COMPARE_PUBLIC_LOGO_URL: "file:/home/operator/logo.webp",
        },
        "public",
      ),
    ).toEqual({
      faviconUrl: null,
      logoUrl: null,
    });
  });
});
