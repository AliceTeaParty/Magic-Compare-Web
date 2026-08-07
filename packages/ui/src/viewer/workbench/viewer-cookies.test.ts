import { describe, expect, it } from "vitest";
import {
  parseViewerPixelRenderingAutoDisabledCookie,
  serializeViewerPixelRenderingAutoDisabledCookie,
} from "./viewer-cookies";

describe("viewer pixel-rendering cookie", () => {
  it("reads only the explicit auto-disable marker", () => {
    expect(
      parseViewerPixelRenderingAutoDisabledCookie(
        "session=abc; magic_compare_pixel_rendering_auto_disabled=1; other=value",
      ),
    ).toBe(true);
    expect(
      parseViewerPixelRenderingAutoDisabledCookie(
        "magic_compare_pixel_rendering_auto_disabled_backup=1",
      ),
    ).toBe(false);
    expect(
      parseViewerPixelRenderingAutoDisabledCookie(
        "magic_compare_pixel_rendering_auto_disabled=unexpected",
      ),
    ).toBe(false);
  });

  it("serializes a one-year site-wide opt-out cookie", () => {
    expect(serializeViewerPixelRenderingAutoDisabledCookie()).toBe(
      "magic_compare_pixel_rendering_auto_disabled=1; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });
});
