export const AB_PIXEL_RENDERING_AUTO_SCALE = 2.5;

/** Enables high-zoom sampling once, unless the current state or a manual opt-out already decides. */
export function shouldAutoEnableAbPixelRendering({
  autoEnableDisabled,
  autoTriggerArmed,
  displayedScale,
  pixelRenderingEnabled,
}: {
  autoEnableDisabled: boolean;
  autoTriggerArmed: boolean;
  displayedScale: number;
  pixelRenderingEnabled: boolean;
}): boolean {
  return (
    !autoEnableDisabled &&
    autoTriggerArmed &&
    !pixelRenderingEnabled &&
    displayedScale >= AB_PIXEL_RENDERING_AUTO_SCALE
  );
}
