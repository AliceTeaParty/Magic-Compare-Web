import { describe, expect, it } from "vitest";
import { buildPublicGroupSlug, kebabCase } from "./index";

describe("shared slug helpers", () => {
  it("normalizes general slugs with kebabCase", () => {
    expect(kebabCase(" Demo Grain Study ")).toBe("demo-grain-study");
  });

  it("preserves the double-hyphen separator for public group slugs", () => {
    expect(buildPublicGroupSlug("demo-grain-study", "banding-check")).toBe(
      "demo-grain-study--banding-check",
    );
  });
});
