import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDefaultPublicExportDir, resolveDefaultPublishedRoot } from "./workspace-env";

describe("workspace paths", () => {
  it("keeps the default published bundle under workspace output", () => {
    expect(resolveDefaultPublishedRoot("/workspace")).toBe(
      path.join("/workspace", "output", "published"),
    );
  });

  it("keeps the default public export under workspace output", () => {
    expect(resolveDefaultPublicExportDir("/workspace")).toBe(
      path.join("/workspace", "output", "public-site"),
    );
  });
});
