import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const workspaceRoot = __dirname;
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && entry[0] !== "FORCE_COLOR" && entry[0] !== "NO_COLOR",
  ),
);
const playwrightOutputRoot = path.join(workspaceRoot, "output", "playwright");
const e2eDatabasePath = path.join(playwrightOutputRoot, "e2e", `internal-site-${process.pid}.db`);
const e2ePublishedRoot = path.join(workspaceRoot, "tests", "e2e", "fixtures", "published");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  outputDir: path.join(playwrightOutputRoot, "test-results"),
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: path.join(playwrightOutputRoot, "playwright-report") }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "internal-chromium",
      testMatch: "internal-site.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3100" },
    },
    {
      name: "public-chromium",
      testMatch: "public-site.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3101" },
    },
  ],
  webServer: [
    {
      command:
        "pnpm --filter @magic-compare/internal-site db:push && pnpm --filter @magic-compare/internal-site exec next dev --port 3100",
      url: "http://localhost:3100",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...inheritedEnvironment,
        PORT: "3100",
        MAGIC_COMPARE_NEXT_DIST_DIR: ".next-e2e",
        DATABASE_URL: `file:${e2eDatabasePath}`,
        MAGIC_COMPARE_HIDE_DEMO: "true",
        MAGIC_COMPARE_S3_BUCKET: "",
        MAGIC_COMPARE_S3_PUBLIC_BASE_URL: "",
        MAGIC_COMPARE_S3_ACCESS_KEY_ID: "",
        MAGIC_COMPARE_S3_SECRET_ACCESS_KEY: "",
      },
    },
    {
      command: "pnpm --filter @magic-compare/public-site exec next dev --port 3101",
      url: "http://localhost:3101/g/e2e-sample--viewer",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...inheritedEnvironment,
        MAGIC_COMPARE_NEXT_DIST_DIR: ".next-e2e",
        MAGIC_COMPARE_HIDE_DEMO: "true",
        MAGIC_COMPARE_PUBLISHED_ROOT: e2ePublishedRoot,
      },
    },
  ],
});
