import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMagicCompareBuildEnv } from "../build-metadata.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");

/** @type {import("next").NextConfig} */
const nextConfig = {
  agentRules: false,
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

export default nextConfig;
