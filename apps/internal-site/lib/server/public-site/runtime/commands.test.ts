import { afterEach, describe, expect, it, vi } from "vitest";
import { appendCommandOutputTail, runCommand } from "./commands";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public runtime commands", () => {
  it("retains only the final 64 KiB from each output stream", () => {
    const result = appendCommandOutputTail(
      Buffer.from("prefix"),
      Buffer.from("x".repeat(70 * 1024)),
    );

    expect(result.byteLength).toBe(64 * 1024);
    expect(result.toString()).toBe("x".repeat(64 * 1024));
  });

  it("bounds stdout and stderr independently for completed commands", async () => {
    const result = await runCommand(
      "node",
      ["-e", "process.stdout.write('a'.repeat(70000)); process.stderr.write('b'.repeat(70000));"],
      process.cwd(),
    );

    expect(Buffer.byteLength(result.stdout)).toBe(64 * 1024);
    expect(Buffer.byteLength(result.stderr)).toBe(64 * 1024);
  });

  it("removes selected inherited flags after applying child overrides", async () => {
    vi.stubEnv("TURBOPACK", "1");
    vi.stubEnv("MAGIC_COMPARE_TEST_INHERITED", "parent");
    vi.stubEnv("MAGIC_COMPARE_TEST_OVERRIDE", "parent");

    const result = await runCommand(
      "node",
      [
        "-e",
        "process.stdout.write(JSON.stringify({ turbopack: process.env.TURBOPACK ?? null, inherited: process.env.MAGIC_COMPARE_TEST_INHERITED, override: process.env.MAGIC_COMPARE_TEST_OVERRIDE }))",
      ],
      process.cwd(),
      {
        env: { MAGIC_COMPARE_TEST_OVERRIDE: "child" },
        unsetEnv: ["TURBOPACK"],
      },
    );

    expect(JSON.parse(result.stdout)).toEqual({
      turbopack: null,
      inherited: "parent",
      override: "child",
    });
  });
});
