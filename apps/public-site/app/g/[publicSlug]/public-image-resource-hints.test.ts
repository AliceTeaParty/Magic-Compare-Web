import { describe, expect, it } from "vitest";
import { getPublicAssetOrigin } from "./public-image-resource-hints";

describe("getPublicAssetOrigin", () => {
  it("extracts an HTTP asset origin without its published path", () => {
    expect(getPublicAssetOrigin("https://assets.example.com/groups/group-1")).toBe(
      "https://assets.example.com",
    );
  });

  it.each(["/published/groups/group-1", "data:image/svg+xml,<svg/>", "not a url"])(
    "skips a resource hint for %s",
    (assetBasePath) => {
      expect(getPublicAssetOrigin(assetBasePath)).toBeNull();
    },
  );
});
