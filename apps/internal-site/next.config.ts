import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
