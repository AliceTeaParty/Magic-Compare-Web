import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { publicDeployStateDirectory } from "./paths";

/** Writes runtime state atomically so a container stop cannot leave a partially written JSON file. */
export async function writePublicDeployState(filename: string, value: unknown): Promise<void> {
  const directory = publicDeployStateDirectory();
  const targetPath = path.join(directory, filename);
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;

  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryPath, targetPath);
}

/** Treats absent or invalid state as empty because deployment can always rebuild it safely. */
export async function readPublicDeployState<T>(filename: string): Promise<T | null> {
  try {
    return JSON.parse(
      await readFile(path.join(publicDeployStateDirectory(), filename), "utf8"),
    ) as T;
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      return null;
    }
    throw error;
  }
}
