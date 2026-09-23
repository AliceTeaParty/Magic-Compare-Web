import { defineConfig } from "@playwright/test";
import config from "./playwright.ci.config";

// Empty catalog/intake screens need an actually empty database, independent from mutation suites.
export default defineConfig({
  ...config,
  outputDir: "output/playwright/empty-test-results",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "output/playwright/empty-report" }],
    ["json", { outputFile: "output/playwright/empty-results.json" }],
  ],
  projects: config
    .projects!.filter((project) => project.metadata?.variant === "internal")
    .map((project) => ({
      ...project,
      testMatch: project.use?.isMobile
        ? ["empty.spec.ts"]
        : ["empty.spec.ts", "upload-empty.spec.ts"],
    })),
  webServer: (Array.isArray(config.webServer) ? config.webServer : [])
    .filter((server) => !server.command.endsWith(" public"))
    .map((server) => ({ ...server, env: { ...server.env, MAGIC_COMPARE_E2E_FIXTURE: "empty" } })),
});
