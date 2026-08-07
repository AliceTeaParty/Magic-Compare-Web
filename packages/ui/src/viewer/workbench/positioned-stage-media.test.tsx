import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PositionedStageMedia } from "./positioned-stage-media";

const asset = {
  id: "before-1",
  kind: "before" as const,
  label: "Before",
  imageUrl: "/published/original.jpg",
  thumbUrl: "/published/thumb.jpg",
  width: 1920,
  height: 1080,
  note: "",
  isPrimaryDisplay: true,
};

beforeAll(() => {
  vi.stubGlobal("React", React);
});

describe("PositionedStageMedia SSR", () => {
  it("keeps the original image discoverable before stage geometry is measured", () => {
    const html = renderToStaticMarkup(
      <PositionedStageMedia
        asset={asset}
        alt="Before image"
        mediaRect={{ x: 0, y: 0, width: 0, height: 0 }}
        rotateStage={false}
        loading="eager"
        fetchPriority="high"
      />,
    );

    expect(html).toContain('src="/published/original.jpg"');
    expect(html).toContain('width="1920"');
    expect(html).toContain('height="1080"');
    expect(html).toContain('data-viewer-stage-image=""');
  });
});
