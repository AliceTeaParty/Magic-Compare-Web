import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

interface RootPackageJson {
  version?: string;
}

function readRootPackageVersion(repoRoot: string) {
  try {
    const rawPackageJson = readFileSync(path.join(repoRoot, "package.json"), "utf8");
    const packageJson = JSON.parse(rawPackageJson) as RootPackageJson;
    return packageJson.version?.trim() || "";
  } catch {
    return "";
  }
}

function readShortGitHash(repoRoot: string) {
  try {
    return execFileSync("git", ["-C", repoRoot, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Next config runs in Node, so build metadata is injected there instead of teaching shared UI
 * packages how to read package.json or shell out to git.
 */
export function resolveMagicCompareBuildEnv(repoRoot: string) {
  const env: Record<string, string> = {};
  const version = process.env.MAGIC_COMPARE_APP_VERSION?.trim() || readRootPackageVersion(repoRoot);
  const commitHash = process.env.MAGIC_COMPARE_COMMIT_SHA?.trim() || readShortGitHash(repoRoot);

  if (version) {
    env.MAGIC_COMPARE_APP_VERSION = version;
  }
  if (commitHash) {
    env.MAGIC_COMPARE_COMMIT_SHA = commitHash;
  }

  return env;
}
