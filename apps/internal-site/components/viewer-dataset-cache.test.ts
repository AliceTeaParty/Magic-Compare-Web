import { describe, expect, it } from "vitest";
import type { ViewerDataset } from "@magic-compare/compare-core/viewer-data";
import { ViewerDatasetCache, ViewerDatasetRequestRegistry } from "./viewer-dataset-cache";

function dataset(slug: string): ViewerDataset {
  return {
    caseMeta: { slug: "case", title: "Case", summary: "", tags: [] },
    group: {
      id: slug,
      slug,
      title: slug,
      description: "",
      defaultMode: "before-after",
      tags: [],
      isPublic: false,
      frames: [],
    },
    siblingGroups: [],
  };
}

describe("ViewerDatasetCache", () => {
  it("bounds entries while protecting the visible group", () => {
    const cache = new ViewerDatasetCache([["/g/current", dataset("current")]]);

    for (let index = 0; index < 6; index += 1) {
      cache.set(`/g/${index}`, dataset(`${index}`), "/g/current");
    }

    expect(cache.size).toBe(5);
    expect(cache.has("/g/current")).toBe(true);
    expect(cache.has("/g/0")).toBe(false);
  });

  it("refreshes recency on a cache hit", () => {
    const cache = new ViewerDatasetCache([], 3);
    cache.set("/g/a", dataset("a"), "/g/a");
    cache.set("/g/b", dataset("b"), "/g/a");
    cache.set("/g/c", dataset("c"), "/g/a");

    expect(cache.get("/g/b")?.group.slug).toBe("b");
    cache.set("/g/d", dataset("d"), "/g/d");

    expect(cache.has("/g/a")).toBe(false);
    expect(cache.has("/g/b")).toBe(true);
  });
});

describe("ViewerDatasetRequestRegistry", () => {
  it("promotes a speculative request when navigation chooses the same target", () => {
    const registry = new ViewerDatasetRequestRegistry<string>();
    let signal: AbortSignal | undefined;
    const pending = new Promise<string>(() => undefined);
    const speculative = registry.load("/g/a", true, (nextSignal) => {
      signal = nextSignal;
      return pending;
    });
    const navigation = registry.load("/g/a", false, () => Promise.resolve("duplicate"));

    expect(navigation).toBe(speculative);
    expect(signal?.aborted).toBe(false);
    registry.abortAll();
  });

  it("aborts a superseded speculative target", () => {
    const registry = new ViewerDatasetRequestRegistry<string>();
    let firstSignal: AbortSignal | undefined;
    const pending = new Promise<string>(() => undefined);
    registry.load("/g/a", true, (signal) => {
      firstSignal = signal;
      return pending;
    });
    registry.load("/g/b", true, () => pending);

    expect(firstSignal?.aborted).toBe(true);
    registry.abortAll();
  });
});
