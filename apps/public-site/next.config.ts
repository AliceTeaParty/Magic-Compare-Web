import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingRoot: path.join(__dirname, "../.."),
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
