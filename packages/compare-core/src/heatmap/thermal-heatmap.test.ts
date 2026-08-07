import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THERMAL_HEATMAP_ALGORITHM } from "./thermal-heatmap";

class TestImageData {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

class TestCanvasContext {
  filter = "none";
  private imageData: TestImageData;

  constructor(width: number, height: number) {
    this.imageData = new TestImageData(width, height);
  }

  putImageData(imageData: TestImageData) {
    this.imageData.data.set(imageData.data);
  }

  drawImage(canvas: TestOffscreenCanvas) {
    this.imageData.data.set(canvas.context.getImageData().data);
  }

  getImageData() {
    const copy = new TestImageData(this.imageData.width, this.imageData.height);
    copy.data.set(this.imageData.data);
    return copy;
  }
}

class TestOffscreenCanvas {
  readonly context: TestCanvasContext;

  constructor(width: number, height: number) {
    this.context = new TestCanvasContext(width, height);
  }

  getContext() {
    return this.context;
  }
}

function imageData(width: number, height: number, pixels: number[]) {
  const image = new TestImageData(width, height);
  image.data.set(pixels);
  return image as unknown as ImageData;
}

describe("THERMAL_HEATMAP_ALGORITHM", () => {
  beforeEach(() => {
    vi.stubGlobal("ImageData", TestImageData);
    vi.stubGlobal("OffscreenCanvas", TestOffscreenCanvas);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps identical sources at the cold color without mutating either input", async () => {
    const before = imageData(1, 1, [20, 40, 60, 255]);
    const comparison = imageData(1, 1, [20, 40, 60, 255]);
    const beforeSnapshot = [...before.data];
    const comparisonSnapshot = [...comparison.data];

    const result = await THERMAL_HEATMAP_ALGORITHM.render(before, comparison);

    expect([...result.data]).toEqual([9, 13, 27, 255]);
    expect([...before.data]).toEqual(beforeSnapshot);
    expect([...comparison.data]).toEqual(comparisonSnapshot);
  });

  it("maps a maximum uniform difference to the hottest color", async () => {
    const result = await THERMAL_HEATMAP_ALGORITHM.render(
      imageData(1, 1, [0, 0, 0, 255]),
      imageData(1, 1, [255, 255, 255, 255]),
    );

    expect([...result.data]).toEqual([216, 54, 39, 255]);
  });

  it("produces stable pixels for a small mixed-difference fixture", async () => {
    const result = await THERMAL_HEATMAP_ALGORITHM.render(
      imageData(2, 1, [0, 0, 0, 255, 80, 80, 80, 255]),
      imageData(2, 1, [20, 40, 60, 255, 200, 160, 120, 255]),
    );

    expect([...result.data]).toEqual([54, 146, 108, 255, 95, 167, 103, 255]);
  });

  it("rejects mismatched dimensions before allocating browser canvases", async () => {
    await expect(
      THERMAL_HEATMAP_ALGORITHM.render(
        imageData(1, 1, [0, 0, 0, 255]),
        imageData(2, 1, [0, 0, 0, 255, 0, 0, 0, 255]),
      ),
    ).rejects.toThrow("matching dimensions");
  });
});
