import { spawn, execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";

const image = "mcr.microsoft.com/playwright:v1.62.1-noble";
const root = process.cwd();
const output = path.join(root, "output/playwright");
await mkdir(output, { recursive: true });
const workspace = await mkdtemp(path.join(output, "visual-linux-"));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--update-snapshots"))
  throw new Error("Only --update-snapshots is supported.");

// Copy the current working tree, including uncommitted tests, without exposing local env files,
// runtime data or installed native modules to the canonical Linux run.
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
for (const file of files) {
  if (path.basename(file).startsWith(".env")) continue;
  try {
    if (!(await stat(file)).isFile()) continue;
  } catch {
    continue;
  }
  const target = path.join(workspace, file);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(file, target);
}
console.log(`Visual tests: ${image}\nIsolated checkout: ${workspace}`);
const child = spawn(
  "docker",
  [
    "run",
    "--rm",
    "--ipc=host",
    "--mount",
    `type=bind,src=${workspace},dst=/work`,
    "--mount",
    "type=volume,src=magic-compare-visual-pnpm,dst=/pnpm",
    "--workdir",
    "/work",
    image,
    "bash",
    "tests/e2e/support/visual-container.sh",
    ...args,
  ],
  { stdio: "inherit" },
);
const code = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", resolve);
});
for (const name of ["playwright-report", "test-results"]) {
  // Reports are disposable; replacing them avoids displaying stale failures from an earlier run.
  await rm(path.join(output, `visual-${name}`), { recursive: true, force: true });
  try {
    await cp(path.join(workspace, "output/playwright", name), path.join(output, `visual-${name}`), {
      recursive: true,
    });
  } catch {
    /* Setup failures may have no browser artifacts. */
  }
}
if (code === 0 && args.includes("--update-snapshots")) {
  await cp(
    path.join(workspace, "tests/e2e/screenshots"),
    path.join(root, "tests/e2e/screenshots"),
    { recursive: true },
  );
  console.log("Updated Linux baselines. Review the PNGs before committing.");
}
process.exitCode = Number(code ?? 1);
