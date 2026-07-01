import { describe, expect, it } from "vitest";
import { scanBrowserUploadFiles } from "./source-scanner";
import type { BrowserUploadFile } from "./web-upload-types";

function image(path: string): BrowserUploadFile {
  return {
    relativePath: path,
    file: new File(["x"], path.split("/").at(-1) ?? "image.png", {
      type: "image/png",
    }),
  };
}

describe("scanBrowserUploadFiles", () => {
  it("pairs flat before and after files by shared frame key", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("sample/frame-001_before.png"),
        image("sample/frame-001_after.png"),
        image("sample/frame-002_before.png"),
        image("sample/frame-002_after.png"),
      ],
      "sample",
    );

    expect(plan.suggestedGroupSlug).toBe("sample");
    expect(plan.frames).toHaveLength(2);
    expect(plan.frames[0].before.source.relativePath).toBe("frame-001_before.png");
    expect(plan.frames[0].after.source.relativePath).toBe("frame-001_after.png");
    expect(plan.issues).toEqual([]);
  });

  it("pairs nested before, after, heatmap, and misc directories", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("case/before/001.png"),
        image("case/after/001.png"),
        image("case/heatmap/001.png"),
        image("case/misc/001_crop.png"),
      ],
      "case",
    );

    expect(plan.frames).toHaveLength(1);
    expect(plan.frames[0].heatmap?.source.relativePath).toBe("heatmap/001.png");
    expect(plan.frames[0].misc).toHaveLength(1);
  });

  it("reports an error when a before file has no matching after file", () => {
    const plan = scanBrowserUploadFiles(
      [image("before/001.png"), image("before/002.png"), image("after/001.png")],
      "broken",
    );

    expect(plan.frames).toHaveLength(1);
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "unmatched-before",
        }),
      ]),
    );
  });

  it("keeps extra after candidates as alternate comparison assets", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("sample/frame-001_before.png"),
        image("sample/frame-001_out.png"),
        image("sample/frame-001_after.png"),
        image("sample/frame-001_rip.png"),
        image("sample/frame-001_nodeband.png"),
        image("sample/frame-001_degrain.png"),
      ],
      "sample",
    );

    expect(plan.frames).toHaveLength(1);
    expect(plan.frames[0].after.source.relativePath).toBe("frame-001_out.png");
    expect(plan.frames[0].misc.map((asset) => asset.source.relativePath)).toEqual([
      "frame-001_after.png",
      "frame-001_degrain.png",
      "frame-001_nodeband.png",
    ]);
    expect(plan.frames[0].misc.map((asset) => asset.label)).toEqual([
      "After",
      "Degrain",
      "NoDeband",
    ]);
  });

  it("caps alternate after assets at three", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("sample/frame-001_before.png"),
        image("sample/frame-001_out.png"),
        image("sample/frame-001_after.png"),
        image("sample/frame-001_rip.png"),
        image("sample/frame-001_degrain.png"),
        image("sample/frame-001_denoise.png"),
      ],
      "sample",
    );

    expect(plan.frames).toHaveLength(1);
    expect(plan.frames[0].misc.map((asset) => asset.source.relativePath)).toEqual([
      "frame-001_after.png",
      "frame-001_degrain.png",
      "frame-001_denoise.png",
    ]);
  });

  it("ignores common sidecar and system files", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("before/001.png"),
        image("after/001.png"),
        {
          relativePath: "before/.DS_Store",
          file: new File([""], ".DS_Store"),
        },
      ],
      "with-noise",
    );

    expect(plan.frames).toHaveLength(1);
    expect(plan.ignoredFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "before/.DS_Store",
        }),
      ]),
    );
  });
});
