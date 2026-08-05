import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import { resolveMagicCompareBuildEnv } from "../build-metadata.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");

/**
 * Development uses a separate output tree so production builds and type generation cannot delete
 * the files that back the running dev server.
 *
 * @param {string} phase
 * @returns {import("next").NextConfig}
 */
export default function createNextConfig(phase) {
  return {
    agentRules: false,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    env: resolveMagicCompareBuildEnv(repoRoot),
    outputFileTracingRoot: repoRoot,
    transpilePackages: [
      "@magic-compare/content-schema",
      "@magic-compare/compare-core",
      "@magic-compare/ui",
      "@magic-compare/shared-utils",
    ],
    experimental: {
      optimizePackageImports: ["@mui/material", "@mui/icons-material"],
    },
  };
}
