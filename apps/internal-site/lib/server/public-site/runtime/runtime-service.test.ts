import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const filesystem = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
const mockedFilesystem = vi.hoisted(() => ({
  cp: vi.fn(),
  rename: vi.fn(),
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    cp: mockedFilesystem.cp,
    rename: mockedFilesystem.rename,
  };
});

import {
  clearDirectoryContents,
  mirrorExportDirectory,
  recoverPreviousExportDirectory,
} from "./runtime-service";

const temporaryRoots: string[] = [];

beforeEach(() => {
  mockedFilesystem.cp.mockReset();
  mockedFilesystem.cp.mockImplementation(filesystem.cp);
  mockedFilesystem.rename.mockReset();
  mockedFilesystem.rename.mockImplementation(filesystem.rename);
});

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directory) => filesystem.rm(directory, { recursive: true, force: true })),
  );
});

describe("public export runtime", () => {
  it("clears build artifacts without replacing a mounted directory root", async () => {
    const root = await filesystem.mkdtemp(join(tmpdir(), "magic-compare-build-output-"));
    temporaryRoots.push(root);
    const buildOutput = join(root, "out");
    await filesystem.mkdir(join(buildOutput, "nested"), { recursive: true });
    await filesystem.writeFile(join(buildOutput, "index.html"), "stale");
    await filesystem.writeFile(join(buildOutput, "nested", "asset.js"), "stale");
    const inodeBefore = (await filesystem.stat(buildOutput)).ino;

    await clearDirectoryContents(buildOutput);

    expect((await filesystem.stat(buildOutput)).ino).toBe(inodeBefore);
    await expect(filesystem.readdir(buildOutput)).resolves.toEqual([]);
  });

  it("promotes a complete export and retains only the immediately previous output", async () => {
    const root = await filesystem.mkdtemp(join(tmpdir(), "magic-compare-export-"));
    temporaryRoots.push(root);
    const source = join(root, "source");
    const target = join(root, "directory with spaces", "public output");
    const previous = `${target}.previous`;
    await filesystem.mkdir(source);
    await filesystem.mkdir(target, { recursive: true });
    await filesystem.mkdir(previous, { recursive: true });
    await filesystem.writeFile(join(source, "index.html"), "exported");
    await filesystem.writeFile(join(target, "index.html"), "current");
    await filesystem.writeFile(join(previous, "index.html"), "stale previous");

    await mirrorExportDirectory(source, target);

    await expect(filesystem.readFile(join(target, "index.html"), "utf8")).resolves.toBe("exported");
    await expect(filesystem.readFile(join(previous, "index.html"), "utf8")).resolves.toBe(
      "current",
    );
    await expect(filesystem.readdir(dirname(target))).resolves.toEqual([
      "public output",
      "public output.previous",
    ]);
  });

  it("keeps the current export when copying a replacement fails", async () => {
    const root = await filesystem.mkdtemp(join(tmpdir(), "magic-compare-export-"));
    temporaryRoots.push(root);
    const target = join(root, "public output");
    await filesystem.mkdir(target);
    await filesystem.writeFile(join(target, "index.html"), "current");

    await expect(mirrorExportDirectory(join(root, "missing"), target)).rejects.toThrow();

    await expect(filesystem.readFile(join(target, "index.html"), "utf8")).resolves.toBe("current");
    await expect(filesystem.readdir(root)).resolves.toEqual(["public output"]);
  });

  it("restores the current export when promoting a replacement fails", async () => {
    const root = await filesystem.mkdtemp(join(tmpdir(), "magic-compare-export-"));
    temporaryRoots.push(root);
    const source = join(root, "source");
    const target = join(root, "public output");
    await filesystem.mkdir(source);
    await filesystem.mkdir(target);
    await filesystem.writeFile(join(source, "index.html"), "replacement");
    await filesystem.writeFile(join(target, "index.html"), "current");
    mockedFilesystem.rename.mockImplementation(async (from: string, to: string) => {
      if (from === `${target}.next` && to === target) {
        throw new Error("promotion failed");
      }
      return filesystem.rename(from, to);
    });

    await expect(mirrorExportDirectory(source, target)).rejects.toThrow("promotion failed");

    await expect(filesystem.readFile(join(target, "index.html"), "utf8")).resolves.toBe("current");
    await expect(filesystem.readdir(root)).resolves.toEqual(["public output", "source"]);
  });

  it("restores the previous export after an interrupted promotion", async () => {
    const root = await filesystem.mkdtemp(join(tmpdir(), "magic-compare-export-"));
    temporaryRoots.push(root);
    const target = join(root, "public output");
    const previous = `${target}.previous`;
    await filesystem.mkdir(previous);
    await filesystem.writeFile(join(previous, "index.html"), "recoverable");

    await recoverPreviousExportDirectory(target);

    await expect(filesystem.readFile(join(target, "index.html"), "utf8")).resolves.toBe(
      "recoverable",
    );
    await expect(filesystem.readdir(root)).resolves.toEqual(["public output"]);
  });
});
