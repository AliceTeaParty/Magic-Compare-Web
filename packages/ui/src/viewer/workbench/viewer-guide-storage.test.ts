import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readViewerGuideState,
  writeViewerGuideState,
} from "./viewer-guide-storage";

describe("viewer guide storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads and writes completed guide state", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    writeViewerGuideState("completed");

    expect(readViewerGuideState()).toBe("completed");
  });

  it("reads and writes dismissed guide state", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    writeViewerGuideState("dismissed");

    expect(readViewerGuideState()).toBe("dismissed");
  });

  it("ignores malformed guide state", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => "unknown",
        setItem: () => undefined,
      },
    });

    expect(readViewerGuideState()).toBeNull();
  });

  it("falls back safely when localStorage throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });

    expect(readViewerGuideState()).toBeNull();
    expect(() => writeViewerGuideState("completed")).not.toThrow();
  });

  it("returns null outside the browser", () => {
    vi.stubGlobal("window", undefined);

    expect(readViewerGuideState()).toBeNull();
  });
});
