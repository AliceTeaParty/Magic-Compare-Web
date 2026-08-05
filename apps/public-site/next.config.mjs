import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import { resolveMagicCompareBuildEnv } from "../build-metadata.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");

/**
 * Keep public preview state independent from the production export cache used by deployments.
 *
 * @param {string} phase
 * @returns {import("next").NextConfig}
 */
export default function createNextConfig(phase) {
  const developmentDistDir = process.env.MAGIC_COMPARE_NEXT_DIST_DIR?.trim() || ".next-dev";
  const publicBuildCpuCount = Math.min(
    8,
    Math.max(1, Number.parseInt(process.env.MAGIC_COMPARE_PUBLIC_BUILD_CPUS || "2", 10) || 2),
  );

  return {
    agentRules: false,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? developmentDistDir : ".next",
    env: resolveMagicCompareBuildEnv(repoRoot),
    output: "export",
    outputFileTracingRoot: repoRoot,
    transpilePackages: [
      "@magic-compare/content-schema",
      "@magic-compare/compare-core",
      "@magic-compare/ui",
      "@magic-compare/shared-utils",
    ],
    experimental: {
      // Two workers let the transient build use a reasonable N100 burst while leaving capacity for
      // the resident internal site. Operators can still tune this independently of idle runtime.
      cpus: publicBuildCpuCount,
      staticGenerationMaxConcurrency: publicBuildCpuCount,
      optimizePackageImports: ["@mui/material", "@mui/icons-material"],
      // Production deploys reuse this cache from a dedicated volume. The build process still exits
      // after each run, so warm deploys consume disk without keeping CPU or memory resident.
      turbopackFileSystemCacheForBuild: true,
    },
  };
}
