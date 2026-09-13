import { describe, expect, it } from "vitest";
import { buildStageImagePlaceholderColors } from "./stage-image-placeholder-colors";

describe("buildStageImagePlaceholderColors", () => {
  it("derives distinct legible Material schemes for light and dark modes", () => {
    const light = buildStageImagePlaceholderColors("#D34A43", false);
    const dark = buildStageImagePlaceholderColors("#D34A43", true);

    expect(light.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(light.foreground).not.toBe(light.background);
    expect(dark.background).not.toBe(light.background);
    expect(dark.foreground).not.toBe(dark.background);
  });
});
