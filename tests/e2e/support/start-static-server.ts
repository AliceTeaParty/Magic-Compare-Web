import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createViewerFixture } from "./viewer-fixture";

/** Builds the current checkout in a disposable copy, preserving dev servers and deployment output. */
async function main() {
  const source = process.cwd();
  const parent = path.join(source, "output/playwright/e2e");
  await mkdir(parent, { recursive: true });
  const workspace = await mkdtemp(path.join(parent, "static-"));
  const excluded = new Set(["node_modules", "out", "published", "coverage", "output"]);
  const filter = (entry: string) =>
    !excluded.has(path.basename(entry)) &&
    !path.basename(entry).startsWith(".next") &&
    !path.basename(entry).startsWith(".env") &&
    // A source-only export fixture has no reason to copy a developer's SQLite database.
    !/\.db(?:-(?:journal|shm|wal))?$/.test(entry);
  for (const name of [
    "apps",
    "packages",
    "scripts",
    "patches",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    ".node-version",
  ]) {
    await cp(path.join(source, name), path.join(workspace, name), { recursive: true, filter });
  }
  // Read installed dependencies through links, while every build/cache/output directory is copied.
  await symlink(path.join(source, "node_modules"), path.join(workspace, "node_modules"), "dir");
  for (const directory of ["apps", "packages"]) {
    for (const entry of await readdir(path.join(source, directory), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        await readdir(path.join(source, directory, entry.name, "node_modules"));
      } catch {
        continue;
      }
      await symlink(
        path.join(source, directory, entry.name, "node_modules"),
        path.join(workspace, directory, entry.name, "node_modules"),
        "dir",
      );
    }
  }
  const fixture = createViewerFixture();
  const published = path.join(workspace, "output/published");
  const group = path.join(published, "groups", fixture.publicSlug);
  await mkdir(group, { recursive: true });
  await writeFile(path.join(group, "manifest.json"), JSON.stringify(fixture));
  const exportDir = path.join(workspace, "output/public-site");
  const env = {
    ...process.env,
    MAGIC_COMPARE_PUBLISHED_ROOT: published,
    MAGIC_COMPARE_PUBLIC_EXPORT_DIR: exportDir,
    MAGIC_COMPARE_S3_PUBLIC_BASE_URL: "",
    MAGIC_COMPARE_HIDE_DEMO: "true",
    MAGIC_COMPARE_PUBLIC_SITE_BASE_URL: "http://localhost:3104",
  };
  console.log(`Building isolated static export in ${workspace}`);
  await run(["public:export"], workspace, env);
  await run(
    ["--filter", "@magic-compare/public-site", "exec", "serve", exportDir, "--listen", "3104"],
    workspace,
    env,
  );
}

/** Retains build output on failure so the CI artifact explains static-only regressions. */
async function run(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = spawn("pnpm", args, { cwd, env, stdio: "inherit" });
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Static E2E command exited ${code}`)),
    );
  });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
