import { describe, expect, it } from "vitest";
import { getFramePreloadRadiusForConnection } from "./viewer-image-preloader";

describe("viewer image preload policy", () => {
  it.each(["slow-2g", "2g", "3g"])("does not speculate on %s connections", (effectiveType) => {
    expect(getFramePreloadRadiusForConnection({ effectiveType })).toBe(0);
  });

  it("honors data saver even when the effective connection is fast", () => {
    expect(
      getFramePreloadRadiusForConnection({
        effectiveType: "4g",
        saveData: true,
      }),
    ).toBe(0);
  });

  it.each([null, {}, { effectiveType: "4g" }])(
    "preloads one adjacent frame on fast or unknown connections",
    (connection) => {
      expect(getFramePreloadRadiusForConnection(connection)).toBe(1);
    },
  );
});
