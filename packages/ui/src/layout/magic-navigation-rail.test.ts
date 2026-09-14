import { describe, expect, it } from "vitest";
import { formatDisplayedAppVersion } from "./magic-navigation-rail";

describe("formatDisplayedAppVersion", () => {
  it("uses compact Greek prerelease labels for alpha and beta versions", () => {
    expect(formatDisplayedAppVersion("2.0.0-alpha.4")).toBe("2.0.0-α.4");
    expect(formatDisplayedAppVersion("2.0.0-beta.1")).toBe("2.0.0-β.1");
  });

  it("keeps stable and unrelated version strings unchanged", () => {
    expect(formatDisplayedAppVersion("2.0.0")).toBe("2.0.0");
    expect(formatDisplayedAppVersion("2.0.0-rc.1")).toBe("2.0.0-rc.1");
  });
});
