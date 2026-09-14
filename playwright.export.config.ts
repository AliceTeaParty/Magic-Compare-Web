import { defineConfig, devices } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  projects: [
    {
      name: "export-chromium",
      testMatch: config.projects!.find((project) => project.name === "public-chromium")!.testMatch,
      metadata: { variant: "public" },
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3104" },
    },
    {
      name: "export-mobile-webkit",
      testMatch: config.projects!.find((project) => project.name === "public-chromium")!.testMatch,
      metadata: { variant: "public" },
      use: { ...devices["iPhone 13"], baseURL: "http://localhost:3104" },
    },
  ],
  webServer: [
    {
      command: "pnpm exec tsx tests/e2e/support/start-server.ts assets",
      url: "http://127.0.0.1:3102/health",
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec tsx tests/e2e/support/start-static-server.ts",
      url: "http://localhost:3104/g/e2e-sample--viewer",
      timeout: 240_000,
      reuseExistingServer: false,
    },
  ],
});
