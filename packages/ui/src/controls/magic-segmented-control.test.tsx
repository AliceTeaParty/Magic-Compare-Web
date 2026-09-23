import React from "react";
import { ToggleButton } from "@mui/material";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MagicSegmentedControl } from "./magic-segmented-control";

beforeAll(() => {
  vi.stubGlobal("React", React);
});

describe("MagicSegmentedControl", () => {
  it("keeps ToggleButtonGroup semantics while rendering centred connected choices", () => {
    const html = renderToStaticMarkup(
      <MagicSegmentedControl exclusive value="a" aria-label="comparison mode">
        <ToggleButton value="a">A / B</ToggleButton>
        <ToggleButton value="heatmap">Heatmap</ToggleButton>
      </MagicSegmentedControl>,
    );

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="comparison mode"');
    expect(html).toContain("A / B");
    expect(html).toContain("Heatmap");
  });
});
