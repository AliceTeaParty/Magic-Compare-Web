import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const workspaceRoot = __dirname;
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && entry[0] !== "FORCE_COLOR" && entry[0] !== "NO_COLOR",
  ),
);
const e2eDatabasePath = path.join(workspaceRoot, "tmp", "e2e", `internal-site-${process.pid}.db`);
const e2ePublishedRoot = path.join(workspaceRoot, "tests", "e2e", "fixtures", "published");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
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
      command: "pnpm --filter @magic-compare/internal-site dev",
      url: "http://localhost:3100",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...inheritedEnvironment,
        PORT: "3100",
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
        MAGIC_COMPARE_HIDE_DEMO: "true",
        MAGIC_COMPARE_PUBLISHED_ROOT: e2ePublishedRoot,
      },
    },
  ],
});
