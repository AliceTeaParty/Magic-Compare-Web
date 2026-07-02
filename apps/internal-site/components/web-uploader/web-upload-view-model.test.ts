import { describe, expect, it } from "vitest";
import {
  buildPlanView,
  frameIdForFrame,
  renameUploadPlanAssetLabel,
  reorderUploadPlan,
  setUploadPlanHeatmapTarget,
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
    label: kind,
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
    expect(reordered?.frames.map((item) => item.title)).toEqual([
      "Frame 3",
      "Frame 1",
      "Frame 2",
    ]);
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

    expect(reorderUploadPlan(originalPlan, "missing", frameIdForFrame(originalPlan.frames[0]))).toBeNull();
    expect(reorderUploadPlan(originalPlan, frameIdForFrame(originalPlan.frames[0]), "missing")).toBeNull();
    expect(reorderUploadPlan(originalPlan, frameIdForFrame(originalPlan.frames[0]), null)).toBeNull();
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
      heatmapAfterLabel: "Rip",
      misc: [{ ...asset("misc", "after/1-rip.png"), label: "Rip" }],
    };

    const renamed = renameUploadPlanAssetLabel(originalPlan, "Rip", "Encode");

    expect(renamed?.frames[0].misc[0].label).toBe("Encode");
    expect(renamed?.frames[0].heatmapAfterLabel).toBe("Encode");
  });

  it("sets the generated heatmap target to an alternate asset", () => {
    const originalPlan = plan();
    originalPlan.frames[0] = {
      ...originalPlan.frames[0],
      misc: [{ ...asset("misc", "after/1-rip.png"), label: "Rip" }],
    };
    const frameId = frameIdForFrame(originalPlan.frames[0]);

    const nextPlan = setUploadPlanHeatmapTarget(originalPlan, frameId, "Rip");

    expect(nextPlan?.frames[0].heatmapAfterLabel).toBe("Rip");
    expect(setUploadPlanHeatmapTarget(nextPlan!, frameId, "after")?.frames[0].heatmapAfterLabel).toBeNull();
  });
});
