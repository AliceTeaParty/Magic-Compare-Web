import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "./map-with-concurrency";

describe("mapWithConcurrency", () => {
  it("preserves input order while respecting the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];

    const pending = mapWithConcurrency([3, 1, 2, 0], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return value * 10;
    });

    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0).forEach((release) => release());

    await expect(pending).resolves.toEqual([30, 10, 20, 0]);
    expect(peak).toBe(2);
  });

  it("returns an empty result without invoking the mapper", async () => {
    const mapper = vi.fn();

    await expect(mapWithConcurrency([], 3, mapper)).resolves.toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });

  it("propagates mapper failures and stops scheduling queued work", async () => {
    const failure = new Error("storage unavailable");
    const mapper = vi.fn(async (value: number) => {
      if (value === 1) {
        throw failure;
      }
      return value;
    });

    await expect(mapWithConcurrency([0, 1, 2, 3], 1, mapper)).rejects.toBe(failure);
    expect(mapper).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid concurrency limits", async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => value)).rejects.toThrow(RangeError);
  });
});
