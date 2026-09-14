import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeHeatmap, renderHeatmap, THERMAL_HEATMAP_ALGORITHM } from "./thermal-heatmap";

class TestImageData {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

/** Synthetic source pixels isolate compression changes from the source's own edges and gradients. */
function fixture(width: number, height: number, pixel: (x: number, y: number) => number[]) {
  const image = new TestImageData(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) image.data.set(pixel(x, y), (y * width + x) * 4);
  return image as ImageData;
}
const solid = (value: number, width = 64, height = 64) =>
  fixture(width, height, () => [value, value, value, 255]);

describe("regional RMS heatmap", () => {
  beforeEach(() => vi.stubGlobal("ImageData", TestImageData));
  afterEach(() => vi.unstubAllGlobals());

  it("keeps identical sources cold without changing input pixels", async () => {
    const before = solid(30);
    const snapshot = [...before.data];
    const analysis = analyzeHeatmap(before, before);
    expect(analysis.rms).toBe(0);
    expect(analysis.regions).toEqual([]);
    expect([...renderHeatmap(analysis).data.slice(0, 4)]).toEqual([12, 14, 18, 255]);
    expect([...before.data]).toEqual(snapshot);
    expect((await THERMAL_HEATMAP_ALGORITHM.render(before, before)).data).toEqual(
      renderHeatmap(analysis).data,
    );
  });

  it("shows maximum uniform change without inventing localized hotspots", () => {
    const analysis = analyzeHeatmap(solid(0), solid(255));
    expect(analysis.rms).toBe(255);
    expect(analysis.regions).toEqual([]);
    expect([...renderHeatmap(analysis).data.slice(0, 4)]).toEqual([255, 245, 160, 255]);
  });

  it("suppresses one-level noise and preserves a fixed minimum scale", () => {
    const analysis = analyzeHeatmap(solid(30), solid(31));
    expect(analysis.autoCeiling).toBe(4);
    expect(analysis.changedFraction).toBe(0);
    expect(analysis.intensity.every((value) => value === 0)).toBe(true);
    expect(analysis.regions).toEqual([]);
  });

  it.each(["dark gradient and credits", "animation outlines"])(
    "finds a subtle damaged patch within %s without highlighting unchanged detail",
    (scene) => {
      const base = (x: number, y: number) =>
        scene === "dark gradient and credits"
          ? 12 + Math.floor(y / 8) + (x > 90 && y < 30 ? 160 : 0)
          : x % 30 < 2 || y % 30 < 2
            ? 20
            : 190;
      const before = fixture(128, 128, (x, y) => [base(x, y), base(x, y), base(x, y), 255]);
      const after = fixture(128, 128, (x, y) => {
        const value = base(x, y) + (x >= 32 && x < 48 && y >= 64 && y < 80 ? 4 : 0);
        return [value, value, value, 255];
      });
      const analysis = analyzeHeatmap(before, after);
      expect(analysis.regions[0]).toEqual({
        x: 0.25,
        y: 0.5,
        width: 0.125,
        height: 0.125,
        score: 4,
      });
      expect(analysis.intensity[70 * 128 + 40]).toBe(3);
      expect(analysis.intensity[10 * 128 + 100]).toBe(0);
      expect(renderHeatmap(analysis).data[(70 * 128 + 40) * 4]).toBeGreaterThan(200);
    },
  );

  it("does not let a rare outlier hide a broader four-level change", () => {
    const after = fixture(128, 128, (x, y) => {
      const value = x === 100 && y === 100 ? 255 : x < 32 && y < 32 ? 4 : 0;
      return [value, value, value, 255];
    });
    const analysis = analyzeHeatmap(solid(0, 128, 128), after);
    expect(analysis.autoCeiling).toBe(4);
    expect(analysis.intensity[16 * 128 + 16]).toBe(3);
  });

  it("measures alternating positive and negative errors before spatial pooling", () => {
    const after = fixture(32, 32, (x, y) => {
      const value = 100 + ((x + y) % 2 ? 4 : -4);
      return [value, value, value, 255];
    });
    const analysis = analyzeHeatmap(solid(100, 32, 32), after);
    expect(analysis.rms).toBe(4);
    expect(analysis.intensity.every((value) => value === 3)).toBe(true);
  });

  it("retains chroma change and visible alpha change while ignoring hidden RGB", () => {
    const source = fixture(1, 1, () => [100, 100, 100, 255]);
    const chroma = fixture(1, 1, () => [106, 97, 100, 255]);
    expect(analyzeHeatmap(source, chroma).rms).toBeCloseTo(Math.sqrt(15));
    const transparent = fixture(1, 1, () => [100, 200, 30, 0]);
    expect(
      analyzeHeatmap(
        transparent,
        fixture(1, 1, () => [0, 0, 0, 0]),
      ).rms,
    ).toBe(0);
    expect(
      analyzeHeatmap(
        transparent,
        fixture(1, 1, () => [0, 0, 0, 255]),
      ).rms,
    ).toBe(255);
  });

  it("is symmetric; sensitivity changes color without changing measured errors or ranking", () => {
    const a = solid(10);
    const b = fixture(64, 64, (x, y) => [x < 16 && y < 16 ? 13 : 10, 10, 10, 255]);
    const analysis = analyzeHeatmap(a, b);
    expect(analyzeHeatmap(b, a)).toEqual(analysis);
    const snapshot = structuredClone(analysis);
    expect(renderHeatmap(analysis, 4).data).not.toEqual(renderHeatmap(analysis, 0.5).data);
    expect(analysis).toEqual(snapshot);
  });

  it("rejects incompatible originals and invalid parameters", () => {
    expect(() => analyzeHeatmap(solid(0, 1, 1), solid(0, 2, 1))).toThrow("matching dimensions");
    expect(() => analyzeHeatmap(solid(0), solid(0), NaN)).toThrow("noise floor");
    expect(() => renderHeatmap(analyzeHeatmap(solid(0), solid(0)), 0)).toThrow("gain");
  });
});
