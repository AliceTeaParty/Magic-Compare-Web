import { describe, expect, it } from "vitest";
import {
  buildInternalSchemeColors,
  buildMagicColorTokens,
  resolveInternalThemeSeed,
} from "./magic-color-tokens";

describe("buildMagicColorTokens", () => {
  it("keeps the requested night seed as the root background", () => {
    const tokens = buildMagicColorTokens();

    expect(tokens.background.default).toBe("#001135");
  });

  it("derives stable HCT tonal roles for the shared theme", () => {
    const tokens = buildMagicColorTokens();

    expect(tokens.background.paper).toBe("#00153e");
    expect(tokens.background.raised).toBe("#031d4b");
    expect(tokens.background.elevated).toBe("#0f2654");
    expect(tokens.primary.main).toBe("#e8c6f6");
    expect(tokens.secondary.main).toBe("#c2c9ff");
    expect(tokens.tertiary.main).toBe("#eae3c1");
    expect(tokens.text.primary).toBe("#fef7d5");
    expect(tokens.outline.default).toBe("#7389d0");
  });
});

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
