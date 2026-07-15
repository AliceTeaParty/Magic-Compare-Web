import { describe, expect, it } from "vitest";
import {
  buildPlanView,
  compactUploadFilename,
  frameIdForFrame,
  getNextUploadPlanTitleDisplayMode,
  getUploadPlanHeatmapReferenceOptions,
  renameUploadPlanAssetLabel,
  reorderUploadPlan,
  setUploadPlanHeatmapReference,
} from "./web-upload-view-model";
import type {
  BrowserUploadFile,
  WebUploadAssetPlan,
  WebUploadFramePlan,
  WebUploadPlan,
} from "./web-upload-types";

function image(path: string): BrowserUploadFile {
  return {
    relativePath: path,
    file: new File(["x"], path.split("/").at(-1) ?? "image.png", {
      type: "image/png",
    }),
  };
}

function asset(kind: WebUploadAssetPlan["kind"], path: string): WebUploadAssetPlan {
  return {
    kind,
    label:
      kind === "before"
        ? "Before"
        : kind === "after"
          ? "After"
          : kind === "heatmap"
            ? "Heatmap"
            : "Misc",
    note: path,
    source: image(path),
  };
}

function frame(order: number): WebUploadFramePlan {
  return {
    order,
    title: `Frame ${order + 1}`,
    caption: "",
    before: asset("before", `before/${order + 1}.png`),
    after: asset("after", `after/${order + 1}.png`),
    heatmap: null,
    misc: [],
  };
}

function plan(): WebUploadPlan {
  return {
    sourceRootName: "sample",
    suggestedGroupSlug: "sample",
    suggestedGroupTitle: "Sample",
    heatmapReferenceLabel: "After",
    frames: [frame(0), frame(1), frame(2)],
    ignoredFiles: [],
    issues: [],
  };
}

describe("web upload view model", () => {
  it("keeps plan and view order aligned after reordering", () => {
    const originalPlan = plan();
    const activeId = frameIdForFrame(originalPlan.frames[2]);
    const overId = frameIdForFrame(originalPlan.frames[0]);

    const reordered = reorderUploadPlan(originalPlan, activeId, overId);
    expect(reordered).not.toBeNull();
    expect(reordered?.frames.map((item) => item.title)).toEqual(["Frame 3", "Frame 1", "Frame 2"]);
    expect(buildPlanView(reordered!).frames.map((item) => item.title)).toEqual([
      "Frame 3",
      "Frame 1",
      "Frame 2",
    ]);
  });

  it("renumbers frame order after reordering", () => {
    const originalPlan = plan();
    const reordered = reorderUploadPlan(
      originalPlan,
      frameIdForFrame(originalPlan.frames[2]),
      frameIdForFrame(originalPlan.frames[0]),
    );

    expect(reordered?.frames.map((item) => item.order)).toEqual([0, 1, 2]);
  });

  it("ignores unknown drag ids", () => {
    const originalPlan = plan();

    expect(
      reorderUploadPlan(originalPlan, "missing", frameIdForFrame(originalPlan.frames[0])),
    ).toBeNull();
    expect(
      reorderUploadPlan(originalPlan, frameIdForFrame(originalPlan.frames[0]), "missing"),
    ).toBeNull();
    expect(
      reorderUploadPlan(originalPlan, frameIdForFrame(originalPlan.frames[0]), null),
    ).toBeNull();
  });

  it("switches to full frame titles and restores the original automatic titles", () => {
    const originalPlan = plan();
    originalPlan.frames[0] = {
      ...originalPlan.frames[0],
      title: "12-27240",
      caption: "WatanaRe Anime Vol1 / 24 fps / frame 27240",
    };

    const autoView = buildPlanView(originalPlan, "auto");
    const fullMode = getNextUploadPlanTitleDisplayMode(autoView.titleDisplayMode);
    const fullView = buildPlanView(originalPlan, fullMode);
    const restoredMode = getNextUploadPlanTitleDisplayMode(fullView.titleDisplayMode);
    const restoredView = buildPlanView(originalPlan, restoredMode);

    expect(autoView.frames[0]).toMatchObject({
      title: "12-27240",
      autoTitle: "12-27240",
      fullTitle: "WatanaRe Anime Vol1-27240",
    });
    expect(fullView.frames[0].title).toBe("WatanaRe Anime Vol1-27240");
    expect(originalPlan.frames[0].title).toBe("12-27240");
    expect(restoredView.frames[0].title).toBe("12-27240");
  });

  it("exposes up to three alternate after columns for preview", () => {
    const originalPlan = plan();
    originalPlan.frames[0] = {
      ...originalPlan.frames[0],
      misc: [
        { ...asset("misc", "after/1-nodeband.png"), label: "NoDeband" },
        { ...asset("misc", "after/1-degrain.png"), label: "Degrain" },
        { ...asset("misc", "after/1-denoise.png"), label: "Denoise" },
        { ...asset("misc", "after/1-clean.png"), label: "Clean" },
      ],
    };

    expect(buildPlanView(originalPlan).frames[0].alternateAfter).toEqual([
      { label: "NoDeband", path: "after/1-nodeband.png" },
      { label: "Degrain", path: "after/1-degrain.png" },
      { label: "Denoise", path: "after/1-denoise.png" },
    ]);
  });

  it("renames alternate column labels in the upload plan", () => {
    const originalPlan = plan();
    originalPlan.frames[0] = {
      ...originalPlan.frames[0],
      misc: [{ ...asset("misc", "after/1-rip.png"), label: "Rip" }],
    };
    originalPlan.heatmapReferenceLabel = "Rip";

    const renamed = renameUploadPlanAssetLabel(
      originalPlan,
      { kind: "misc", label: "Rip" },
      "Encode",
    );

    expect(renamed?.frames[0].misc[0].label).toBe("Encode");
    expect(renamed?.heatmapReferenceLabel).toBe("Encode");
  });

  it("renames the before column label in the upload plan", () => {
    const originalPlan = plan();

    const renamed = renameUploadPlanAssetLabel(originalPlan, { kind: "before" }, "Source");

    expect(renamed?.frames.map((item) => item.before.label)).toEqual([
      "Source",
      "Source",
      "Source",
    ]);
    expect(buildPlanView(renamed!).beforeLabel).toBe("Source");
  });

  it("renames the after column label and keeps the heatmap reference aligned", () => {
    const originalPlan = plan();

    const renamed = renameUploadPlanAssetLabel(originalPlan, { kind: "after" }, "Output");

    expect(renamed?.frames.map((item) => item.after.label)).toEqual(["Output", "Output", "Output"]);
    expect(renamed?.heatmapReferenceLabel).toBe("Output");
    expect(getUploadPlanHeatmapReferenceOptions(renamed!)).toEqual(["Output"]);
  });

  it("rejects image column labels that collide with existing labels or Heatmap", () => {
    const originalPlan = plan();
    originalPlan.frames[0] = {
      ...originalPlan.frames[0],
      misc: [
        { ...asset("misc", "after/1-rip.png"), label: "Rip" },
        { ...asset("misc", "after/1-degrain.png"), label: "Degrain" },
      ],
    };

    expect(renameUploadPlanAssetLabel(originalPlan, { kind: "before" }, "")).toBeNull();
    expect(renameUploadPlanAssetLabel(originalPlan, { kind: "before" }, "After")).toBeNull();
    expect(renameUploadPlanAssetLabel(originalPlan, { kind: "after" }, "Rip")).toBeNull();
    expect(
      renameUploadPlanAssetLabel(originalPlan, { kind: "misc", label: "Rip" }, "Degrain"),
    ).toBeNull();
    expect(
      renameUploadPlanAssetLabel(originalPlan, { kind: "misc", label: "Rip" }, "Heatmap"),
    ).toBeNull();
  });

  it("only exposes global heatmap references available on every frame", () => {
    const originalPlan = plan();
    originalPlan.frames[0] = {
      ...originalPlan.frames[0],
      misc: [{ ...asset("misc", "after/1-rip.png"), label: "Rip" }],
    };
    originalPlan.frames[1] = {
      ...originalPlan.frames[1],
      misc: [
        { ...asset("misc", "after/2-rip.png"), label: "Rip" },
        { ...asset("misc", "after/2-deband.png"), label: "Deband" },
      ],
    };
    originalPlan.frames[2] = {
      ...originalPlan.frames[2],
      misc: [{ ...asset("misc", "after/3-rip.png"), label: "Rip" }],
    };

    expect(getUploadPlanHeatmapReferenceOptions(originalPlan)).toEqual(["After", "Rip"]);

    const nextPlan = setUploadPlanHeatmapReference(originalPlan, "Rip");

    expect(nextPlan?.heatmapReferenceLabel).toBe("Rip");
    expect(setUploadPlanHeatmapReference(nextPlan!, "Deband")).toBeNull();
  });

  it("compacts long upload filenames by preserving the head and tail", () => {
    expect(compactUploadFilename("short.png")).toBe("short.png");
    expect(compactUploadFilename("24_WATANARE_ANIME_VOL1_00000.gen.vpy-27240-output.png")).toBe(
      "24_WATANARE_ANIME_V…y-27240-output.png",
    );
  });
});
