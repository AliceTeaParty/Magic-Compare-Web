import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import config from "./playwright.config";

// macOS font rasterization changed checked-in pixels without changing the upload layout.
// Baseline updates must run in the same pinned Linux browser image as CI.
if (
  process.platform !== "linux" &&
  process.argv.some((arg) => arg.startsWith("--update-snapshots"))
) {
  throw new Error("Update visual baselines with pnpm test:e2e:visual:docker --update-snapshots.");
}

export default defineConfig({
  ...config,
  // Release labels are fixture data here; format changes still alter pixels, version bumps do not.
  webServer: (Array.isArray(config.webServer) ? config.webServer : [config.webServer!]).map(
    (server) => ({
      ...server,
      env: {
        ...server.env,
        MAGIC_COMPARE_APP_VERSION: "2.0.0-alpha.4",
        MAGIC_COMPARE_COMMIT_SHA: "visual-fixture",
      },
    }),
  ),
  // Reviewed in the pinned Playwright Linux image; ordinary E2E never updates visual baselines.
  snapshotPathTemplate: "{testDir}/screenshots/{projectName}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      // Hiding carets mutates SSR input styles before hydration; no fields are focused in baselines.
      caret: "initial",
      maxDiffPixels: 30,
      threshold: 0.15,
      stylePath: path.join(__dirname, "tests/e2e/support/screenshot.css"),
    },
  },
  use: {
    ...config.use,
    contextOptions: { reducedMotion: "reduce" },
    baseURL: "http://localhost:3101",
  },
  projects: [
    {
      name: "visual-desktop",
      testMatch: ["viewer.visual.spec.ts", "internal.visual.spec.ts", "upload.visual.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "visual-mobile",
      testMatch: ["viewer.visual.spec.ts", "internal.visual.spec.ts"],
      use: { ...devices["iPhone 13"] },
    },
  ],
});
