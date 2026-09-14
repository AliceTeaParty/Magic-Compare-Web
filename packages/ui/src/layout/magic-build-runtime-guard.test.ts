import { describe, expect, it } from "vitest";
import { buildIdentityKey, buildRefreshUrl, parseRuntimeBuild } from "./magic-build-runtime-guard";

describe("runtime build recovery", () => {
  it("detects commits within the same release and ignores missing identity", () => {
    expect(buildIdentityKey({ appVersion: "2.0.0-alpha.4", commitHash: "aaa" })).not.toBe(
      buildIdentityKey({ appVersion: "2.0.0-alpha.4", commitHash: "bbb" }),
    );
    expect(buildIdentityKey({ appVersion: null, commitHash: null })).toBeNull();
  });
  it("rejects incomplete or unrelated metadata", () => {
    for (const value of [
      null,
      {},
      "html",
      { appVersion: 4, commitHash: "x" },
      { appVersion: null, commitHash: null },
    ]) {
      expect(parseRuntimeBuild(value)).toBeNull();
    }
    expect(parseRuntimeBuild({ appVersion: "2", commitHash: "abc" })).toEqual({
      appVersion: "2",
      commitHash: "abc",
    });
  });
  it("refreshes the current document while preserving frame queries and hash", () => {
    expect(
      buildRefreshUrl("https://example.com/g/sample?frame=3&__mc_refresh=old#stage", "new"),
    ).toBe("https://example.com/g/sample?frame=3&__mc_refresh=new#stage");
  });
});
