import { describe, expect, it } from "vitest";
import {
  parseViewerDetailsCookie,
  parseViewerModeCookie,
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

describe("viewer details cookie", () => {
  it("parses open and closed values from compact cookie headers", () => {
    expect(parseViewerDetailsCookie("session=abc;magic_compare_open_details=1")).toBe(true);
    expect(parseViewerDetailsCookie("magic_compare_open_details=0")).toBe(false);
  });

  it("returns null for missing or malformed values", () => {
    expect(parseViewerDetailsCookie("magic_compare_open_details=unexpected")).toBeNull();
    expect(parseViewerDetailsCookie("other=value")).toBeNull();
  });
});

describe("viewer mode cookie", () => {
  it("parses every supported mode without requiring separator spaces", () => {
    expect(parseViewerModeCookie("session=abc;magic_compare_viewer_mode=before-after")).toBe(
      "before-after",
    );
    expect(parseViewerModeCookie("magic_compare_viewer_mode=a-b")).toBe("a-b");
    expect(parseViewerModeCookie("magic_compare_viewer_mode=heatmap")).toBe("heatmap");
  });

  it("returns null for unsupported or malformed encoded modes", () => {
    expect(parseViewerModeCookie("magic_compare_viewer_mode=unsupported")).toBeNull();
    expect(parseViewerModeCookie("magic_compare_viewer_mode=%E0%A4%A")).toBeNull();
  });
});
