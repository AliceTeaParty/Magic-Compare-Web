import { describe, expect, it } from "vitest";
import { DEMO_CASE_SLUG, buildPublicGroupSlug, kebabCase, parseEnvFlag } from "./index";

describe("shared slug helpers", () => {
  it("normalizes general slugs with kebabCase", () => {
    expect(kebabCase(" Demo Grain Study ")).toBe("demo-grain-study");
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
});
