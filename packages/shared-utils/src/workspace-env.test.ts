import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDefaultPublishedRoot } from "./workspace-env";

describe("workspace paths", () => {
  it("keeps the default published bundle under workspace output", () => {
    expect(resolveDefaultPublishedRoot("/workspace")).toBe(
      path.join("/workspace", "output", "published"),
    );
  });
});
