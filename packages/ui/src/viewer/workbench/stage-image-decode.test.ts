import { describe, expect, it, vi } from "vitest";
import { waitForStageImageDecode, type StageImageDecodeTarget } from "./stage-image-decode";

describe("waitForStageImageDecode", () => {
  it("waits for decoded pixels before reporting readiness", async () => {
    let finishDecode: (() => void) | undefined;
    const image: StageImageDecodeTarget = {
      currentSrc: "https://assets.example.com/frame-1.png",
      naturalWidth: 1920,
      decode: () =>
        new Promise<void>((resolve) => {
          finishDecode = resolve;
        }),
    };

    const ready = waitForStageImageDecode(image);
    let settled = false;
    void ready.then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    finishDecode?.();
    await expect(ready).resolves.toBe(true);
  });

  it("accepts paintable pixels when decode rejects", async () => {
    const image: StageImageDecodeTarget = {
      currentSrc: "https://assets.example.com/frame-1.png",
      naturalWidth: 1920,
      decode: vi.fn().mockRejectedValue(new Error("decode unavailable")),
    };

    await expect(waitForStageImageDecode(image)).resolves.toBe(true);
  });

  it("ignores a late decode after the image source changes", async () => {
    let finishDecode: (() => void) | undefined;
    const image: StageImageDecodeTarget = {
      currentSrc: "https://assets.example.com/frame-1.png",
      naturalWidth: 1920,
      decode: () =>
        new Promise<void>((resolve) => {
          finishDecode = resolve;
        }),
    };

    const ready = waitForStageImageDecode(image);
    image.currentSrc = "https://assets.example.com/frame-2.png";
    finishDecode?.();

    await expect(ready).resolves.toBe(false);
  });
});
