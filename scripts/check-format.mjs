import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function gitLines(arguments_) {
  const output = execFileSync("git", arguments_, {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return output.split(/\r?\n/).filter(Boolean);
}

/**
 * Local checks cover staged, unstaged, and untracked files. CI supplies the pull request or push
 * base SHA so every file introduced by a multi-commit change is checked without formatting the
 * repository's unrelated historical backlog.
 */
function listChangedFiles() {
  const baseRef = process.env.FORMAT_BASE_REF?.trim();
  const trackedFiles = baseRef
    ? gitLines(["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...HEAD`])
    : gitLines(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]);
  const untrackedFiles = baseRef ? [] : gitLines(["ls-files", "--others", "--exclude-standard"]);

  return [...new Set([...trackedFiles, ...untrackedFiles])].filter((relativePath) => {
    const absolutePath = path.join(workspaceRoot, relativePath);
    return existsSync(absolutePath) && statSync(absolutePath).isFile();
  });
}

// Keep the default check scoped to the active change so legacy formatting debt stays visible but
// does not force unrelated rewrites during routine development.
function main() {
  const changedFiles = listChangedFiles();
  if (changedFiles.length === 0) {
    console.log("No changed files need formatting checks.");
    return;
  }

  execFileSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "prettier", "--check", "--ignore-unknown", ...changedFiles],
    { cwd: workspaceRoot, stdio: "inherit" },
  );
}

main();
