import { describe, expect, it } from "vitest";
import {
  AB_PIXEL_RENDERING_AUTO_SCALE,
  shouldAutoEnableAbPixelRendering,
} from "./ab-pixel-rendering";

describe("shouldAutoEnableAbPixelRendering", () => {
  it("enables at the 250% boundary", () => {
    expect(
      shouldAutoEnableAbPixelRendering({
        autoEnableDisabled: false,
        autoTriggerArmed: true,
        displayedScale: AB_PIXEL_RENDERING_AUTO_SCALE,
        pixelRenderingEnabled: false,
      }),
    ).toBe(true);
  });

  it("does not enable below 250%", () => {
    expect(
      shouldAutoEnableAbPixelRendering({
        autoEnableDisabled: false,
        autoTriggerArmed: true,
        displayedScale: AB_PIXEL_RENDERING_AUTO_SCALE - 0.01,
        pixelRenderingEnabled: false,
      }),
    ).toBe(false);
  });

  it("respects a manual opt-out at high zoom", () => {
    expect(
      shouldAutoEnableAbPixelRendering({
        autoEnableDisabled: true,
        autoTriggerArmed: true,
        displayedScale: 8,
        pixelRenderingEnabled: false,
      }),
    ).toBe(false);
  });

  it("leaves an already enabled state unchanged", () => {
    expect(
      shouldAutoEnableAbPixelRendering({
        autoEnableDisabled: false,
        autoTriggerArmed: true,
        displayedScale: 8,
        pixelRenderingEnabled: true,
      }),
    ).toBe(false);
  });

  it("waits for a new threshold crossing after a manual close", () => {
    expect(
      shouldAutoEnableAbPixelRendering({
        autoEnableDisabled: false,
        autoTriggerArmed: false,
        displayedScale: 8,
        pixelRenderingEnabled: false,
      }),
    ).toBe(false);
  });
});
