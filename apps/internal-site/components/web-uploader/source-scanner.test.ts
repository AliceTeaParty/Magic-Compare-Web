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

  it("keeps same-number flat frames separate when their prefixes differ", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("sample/clip-a-001_src.png"),
        image("sample/clip-a-001_output.png"),
        image("sample/clip-b-001_src.png"),
        image("sample/clip-b-001_output.png"),
      ],
      "sample",
    );

    expect(plan.frames).toHaveLength(2);
    expect(plan.issues).toEqual([]);
    expect(plan.frames.map((frame) => frame.before.source.relativePath)).toEqual([
      "clip-a-001_src.png",
      "clip-b-001_src.png",
    ]);
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

  it("uses the first after label as the default heatmap reference for src/rip/flt sets", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("case/src/001.png"),
        image("case/rip/001.png"),
        image("case/flt/001_crop.png"),
      ],
      "case",
    );

    expect(plan.frames).toHaveLength(1);
    expect(plan.frames[0].after.label).toBe("Rip");
    expect(plan.heatmapReferenceLabel).toBe("Rip");
  });

  it("uses a common comparison label when the first frame after label is not shared", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("sample/frame-001_src.png"),
        image("sample/frame-001_output.png"),
        image("sample/frame-001_rip.png"),
        image("sample/frame-002_src.png"),
        image("sample/frame-002_rip.png"),
      ],
      "sample",
    );

    expect(plan.frames.map((frame) => frame.after.label)).toEqual(["After", "Rip"]);
    expect(plan.frames[0].misc.map((asset) => asset.label)).toEqual(["Rip"]);
    expect(plan.heatmapReferenceLabel).toBe("Rip");
    expect(plan.issues).toEqual([]);
  });

  it("reports an error when no heatmap reference label is shared by every frame", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("sample/frame-001_src.png"),
        image("sample/frame-001_output.png"),
        image("sample/frame-002_src.png"),
        image("sample/frame-002_rip.png"),
      ],
      "sample",
    );

    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "heatmap-reference-missing",
        }),
      ]),
    );
  });

  it("preserves nested out and output directory variants for primary selection", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("case/src/001.png"),
        image("case/output/001.png"),
        image("case/out/001.png"),
      ],
      "case",
    );

    expect(plan.frames).toHaveLength(1);
    expect(plan.frames[0].after.source.relativePath).toBe("out/001.png");
    expect(plan.frames[0].misc.map((asset) => asset.source.relativePath)).toEqual([
      "output/001.png",
    ]);
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
      "frame-001_rip.png",
      "frame-001_nodeband.png",
    ]);
    expect(plan.frames[0].misc.map((asset) => asset.label)).toEqual([
      "After",
      "Rip",
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
      "frame-001_rip.png",
      "frame-001_degrain.png",
    ]);
  });

  it("keeps output as After and rip as a separate comparison column", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("24_WATANARE_ANIME_VOL1_00000.gen.vpy-27240-src.png"),
        image("24_WATANARE_ANIME_VOL1_00000.gen.vpy-27240-output.png"),
        image("24_WATANARE_ANIME_VOL1_00000.gen.vpy-27240-rip.png"),
      ],
      "20260702",
    );

    expect(plan.frames).toHaveLength(1);
    expect(plan.frames[0].title).toBe("0-27240");
    expect(plan.frames[0].caption).toContain("WATANARE ANIME VOL1");
    expect(plan.frames[0].after.label).toBe("After");
    expect(plan.frames[0].after.source.relativePath).toBe(
      "24_WATANARE_ANIME_VOL1_00000.gen.vpy-27240-output.png",
    );
    expect(plan.frames[0].misc.map((asset) => asset.label)).toEqual(["Rip"]);
  });

  it("formats VSEditor frame titles with episode width from the scanned set", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("24_TITLE_00000.gen.vpy-2183-src.png"),
        image("24_TITLE_00000.gen.vpy-2183-output.png"),
        image("24_TITLE_00012.gen.vpy-27240-src.png"),
        image("24_TITLE_00012.gen.vpy-27240-output.png"),
      ],
      "测试目录",
    );

    expect(plan.suggestedGroupSlug).toBe("ceshimulu");
    expect(plan.frames.map((frame) => frame.title)).toEqual(["00-2183", "12-27240"]);
  });

  it("sorts structured flat volumes numerically when episode and frame match", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("TITLE_VOL10_00000.m2ts-27240-src.png"),
        image("TITLE_VOL10_00000.m2ts-27240-output.png"),
        image("TITLE_VOL2_00000.m2ts-27240-src.png"),
        image("TITLE_VOL2_00000.m2ts-27240-output.png"),
      ],
      "20260702",
    );

    expect(plan.frames).toHaveLength(2);
    expect(plan.frames.map((frame) => frame.before.source.relativePath)).toEqual([
      "TITLE_VOL2_00000.m2ts-27240-src.png",
      "TITLE_VOL10_00000.m2ts-27240-src.png",
    ]);
  });

  it("keeps unrelated flat titles grouped before comparing volume numbers", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("BBB_VOL2_00000.m2ts-27240-src.png"),
        image("BBB_VOL2_00000.m2ts-27240-output.png"),
        image("AAA_VOL10_00000.m2ts-27240-src.png"),
        image("AAA_VOL10_00000.m2ts-27240-output.png"),
      ],
      "20260702",
    );

    expect(plan.frames).toHaveLength(2);
    expect(plan.frames.map((frame) => frame.before.source.relativePath)).toEqual([
      "AAA_VOL10_00000.m2ts-27240-src.png",
      "BBB_VOL2_00000.m2ts-27240-src.png",
    ]);
  });

  it("sorts structured nested volumes numerically when episode and frame match", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("case/before/TITLE_VOL10_00000.m2ts-27240.png"),
        image("case/after/TITLE_VOL10_00000.m2ts-27240.png"),
        image("case/before/TITLE_VOL2_00000.m2ts-27240.png"),
        image("case/after/TITLE_VOL2_00000.m2ts-27240.png"),
      ],
      "case",
    );

    expect(plan.frames).toHaveLength(2);
    expect(plan.frames.map((frame) => frame.before.source.relativePath)).toEqual([
      "before/TITLE_VOL2_00000.m2ts-27240.png",
      "before/TITLE_VOL10_00000.m2ts-27240.png",
    ]);
  });

  it("recognizes structured encode filenames with m2ts markers and no fps prefix", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("WATANARE_ANIME_VOL1_00000.m2ts-27240-src.png"),
        image("WATANARE_ANIME_VOL1_00000.m2ts-27240-output.png"),
        image("WATANARE_ANIME_VOL1_00000.m2ts-27240-rip.png"),
      ],
      "20260702",
    );

    expect(plan.frames).toHaveLength(1);
    expect(plan.frames[0].title).toBe("0-27240");
    expect(plan.frames[0].caption).toContain("WATANARE ANIME VOL1");
    expect(plan.frames[0].after.label).toBe("After");
    expect(plan.frames[0].misc.map((asset) => asset.label)).toEqual(["Rip"]);
  });

  it("recognizes structured encode filenames without an explicit source marker", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("24_WATANARE_ANIME_VOL1_00000-27240-src.png"),
        image("24_WATANARE_ANIME_VOL1_00000-27240-output.png"),
        image("24_WATANARE_ANIME_VOL1_00000-27240-rip.png"),
      ],
      "20260702",
    );

    expect(plan.frames).toHaveLength(1);
    expect(plan.frames[0].title).toBe("0-27240");
    expect(plan.frames[0].caption).toContain("WATANARE ANIME VOL1");
    expect(plan.frames[0].after.label).toBe("After");
    expect(plan.frames[0].misc.map((asset) => asset.label)).toEqual(["Rip"]);
  });

  it("pairs structured filenames even when only some variants keep the fps prefix", () => {
    const plan = scanBrowserUploadFiles(
      [
        image("24_WATANARE_ANIME_VOL1_00000.gen.vpy-27240-src.png"),
        image("WATANARE_ANIME_VOL1_00000.m2ts-27240-output.png"),
      ],
      "20260702",
    );

    expect(plan.frames).toHaveLength(1);
    expect(plan.frames[0].title).toBe("0-27240");
    expect(plan.frames[0].before.source.relativePath).toBe(
      "24_WATANARE_ANIME_VOL1_00000.gen.vpy-27240-src.png",
    );
    expect(plan.frames[0].after.source.relativePath).toBe(
      "WATANARE_ANIME_VOL1_00000.m2ts-27240-output.png",
    );
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
