import { describe, expect, it } from "vitest";
import { buildInternalSchemeColors, resolveInternalThemeSeed } from "./magic-color-tokens";

describe("resolveInternalThemeSeed", () => {
  it("normalizes valid custom colors and falls back from invalid persisted input", () => {
    expect(resolveInternalThemeSeed("custom:#1a2b3c")).toEqual({
      storageValue: "custom:#1A2B3C",
      hex: "#1A2B3C",
      presetId: null,
    });
    expect(resolveInternalThemeSeed("custom:red")).toMatchObject({
      storageValue: "iris",
      presetId: "iris",
    });
  });

  it("builds distinct expressive light and dark surface roles from one seed", () => {
    const light = buildInternalSchemeColors("lagoon", false);
    const dark = buildInternalSchemeColors("lagoon", true);

    expect(light.mode).toBe("light");
    expect(dark.mode).toBe("dark");
    expect(light.surfaceContainer).not.toBe(dark.surfaceContainer);
    expect(light.primary.main).not.toBe(dark.primary.main);
    expect(light.success.container).toMatch(/^#[0-9a-f]{6}$/);
  });
});
