import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
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
      testMatch: ["viewer.visual.spec.ts", "internal.visual.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "visual-mobile",
      testMatch: ["viewer.visual.spec.ts", "internal.visual.spec.ts"],
      use: { ...devices["iPhone 13"] },
    },
  ],
});
