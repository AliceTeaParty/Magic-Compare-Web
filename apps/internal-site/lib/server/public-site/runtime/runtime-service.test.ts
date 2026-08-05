import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mirrorExportDirectory } from "./runtime-service";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("public export runtime", () => {
  it("creates an export target whose missing parent contains spaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "magic-compare-export-"));
    temporaryRoots.push(root);
    const source = join(root, "source");
    const target = join(root, "directory with spaces", "public output");
    await mkdir(source);
    await writeFile(join(source, "index.html"), "exported");

    await mirrorExportDirectory(source, target);

    await expect(readFile(join(target, "index.html"), "utf8")).resolves.toBe("exported");
  });
});
