import { describe, expect, it } from "vitest";
import { buildPublishManifestFixture } from "./publish-manifest.test-fixture";
import { parsePublishedRouteAlias } from "./public-route-alias";

describe("parsePublishedRouteAlias", () => {
  it("derives the legacy case/group route from a valid manifest", () => {
    const manifest = buildPublishManifestFixture({
      caseSlug: "mono",
      groupSlug: "comparison",
    });

    expect(parsePublishedRouteAlias(JSON.stringify(manifest))).toEqual({
      caseSlug: "mono",
      groupSlug: "comparison",
      publicSlug: "mono--comparison",
    });
  });

  it.each(["{", JSON.stringify({ schemaVersion: 1 })])(
    "skips invalid JSON and schema payloads",
    (contents) => {
      expect(parsePublishedRouteAlias(contents)).toBeNull();
    },
  );
});
