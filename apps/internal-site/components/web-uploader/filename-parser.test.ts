import { describe, expect, it } from "vitest";
import { parseUploadFilenameStem } from "./filename-parser";

describe("parseUploadFilenameStem", () => {
  it.each([
    ["clip - 0001 - before", { prefix: "clip", frame: "0001", variant: "before" }],
    ["clip-0002-after", { prefix: "clip", frame: "0002", variant: "after" }],
    ["clip_0003_src", { prefix: "clip", frame: "0003", variant: "src" }],
    ["clip.0004.output", { prefix: "clip", frame: "0004", variant: "output" }],
  ])("parses %s", (stem, expected) => {
    expect(parseUploadFilenameStem(stem)).toEqual(expected);
  });

  it("defaults the variant to null when only prefix and frame are present", () => {
    expect(parseUploadFilenameStem("clip_0005")).toEqual({
      prefix: "clip",
      frame: "0005",
      variant: null,
    });
  });
});
