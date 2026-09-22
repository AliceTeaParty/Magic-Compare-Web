import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readWorkspaceFile(relativePath) {
  return readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function requireMatch(value, pattern, description) {
  const match = value.match(pattern);
  if (!match) {
    throw new Error(`Could not read ${description}.`);
  }
  return match;
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function main() {
  const nodeVersion = readWorkspaceFile(".node-version").trim();
  if (!/^\d+\.\d+\.\d+$/.test(nodeVersion)) {
    throw new Error(".node-version must contain an exact x.y.z release.");
  }

  const rootPackage = JSON.parse(readWorkspaceFile("package.json"));
  const nodeRange = rootPackage.engines?.node;
  const pnpmVersion = rootPackage.engines?.pnpm;
  const packageManager = rootPackage.packageManager;
  const minimumNode = requireMatch(
    nodeRange,
    />=(\d+\.\d+\.\d+)/,
    "package.json engines.node minimum",
  )[1];
  const exclusiveNodeMajor = Number(
    requireMatch(nodeRange, /<(\d+)/, "package.json engines.node maximum")[1],
  );

  if (
    compareVersions(nodeVersion, minimumNode) < 0 ||
    Number(nodeVersion.split(".")[0]) >= exclusiveNodeMajor
  ) {
    throw new Error(
      `.node-version ${nodeVersion} is outside package.json engines.node ${nodeRange}.`,
    );
  }
  if (packageManager !== `pnpm@${pnpmVersion}`) {
    throw new Error("packageManager must pin the pnpm version declared in engines.pnpm.");
  }

  const dockerfile = readWorkspaceFile("docker/internal-site.Dockerfile");
  const dockerNodeVersion = requireMatch(
    dockerfile,
    /^FROM node:(\d+\.\d+\.\d+)-/m,
    "Docker Node base image",
  )[1];
  if (dockerNodeVersion !== nodeVersion) {
    throw new Error(`Docker Node ${dockerNodeVersion} must match .node-version ${nodeVersion}.`);
  }

  const playwrightVersion = requireMatch(
    rootPackage.devDependencies?.["@playwright/test"] ?? "",
    /(\d+\.\d+\.\d+)/,
    "@playwright/test version",
  )[1];
  const ciWorkflow = readWorkspaceFile(".github/workflows/ci.yml");
  const playwrightImageVersion = requireMatch(
    ciWorkflow,
    /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-/,
    "Playwright Docker image",
  )[1];
  if (playwrightImageVersion !== playwrightVersion) {
    throw new Error(
      `Playwright Docker image ${playwrightImageVersion} must match @playwright/test ${playwrightVersion}.`,
    );
  }

  for (const workflowPath of [
    ".github/workflows/ci.yml",
    ".github/workflows/browser-ui.yml",
    ".github/workflows/ghcr-docker.yml",
  ]) {
    const workflow = readWorkspaceFile(workflowPath);
    if (/^\s*node-version:\s/m.test(workflow)) {
      throw new Error(`${workflowPath} must use node-version-file: .node-version.`);
    }
    const setupNodeCount = [...workflow.matchAll(/^\s*(?:-\s+)?uses: actions\/setup-node@/gm)]
      .length;
    const versionFileCount = [...workflow.matchAll(/^\s*node-version-file: \.node-version$/gm)]
      .length;
    if (setupNodeCount !== versionFileCount) {
      throw new Error(`${workflowPath} must configure every setup-node action from .node-version.`);
    }
  }

  console.log(
    `Toolchain declarations agree: Node ${nodeVersion}, pnpm ${pnpmVersion}, Playwright ${playwrightVersion}.`,
  );
}

main();
