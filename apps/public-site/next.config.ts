import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { resolveMagicCompareBuildEnv } from "../build-metadata";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
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
    optimizePackageImports: ["@mui/material", "@mui/icons-material"],
  },
};

export default nextConfig;
