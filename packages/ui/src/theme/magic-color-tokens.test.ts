import { describe, expect, it } from "vitest";
import { buildMagicColorTokens } from "./magic-color-tokens";

describe("buildMagicColorTokens", () => {
  it("keeps the requested night seed as the root background", () => {
    const tokens = buildMagicColorTokens();

    expect(tokens.background.default).toBe("#152B59");
  });

  it("derives stable HCT tonal roles for the shared theme", () => {
    const tokens = buildMagicColorTokens();

    expect(tokens.background.paper).toBe("#1e3361");
    expect(tokens.background.raised).toBe("#283c6b");
    expect(tokens.primary.main).toBe("#e8c6f6");
    expect(tokens.secondary.main).toBe("#c2c9ff");
    expect(tokens.tertiary.main).toBe("#eae3c1");
    expect(tokens.text.primary).toBe("#fef7d5");
    expect(tokens.outline.default).toBe("#7389d0");
  });
});
