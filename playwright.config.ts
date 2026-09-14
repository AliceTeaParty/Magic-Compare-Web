import path from "node:path";
import { randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const workspaceRoot = __dirname;
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && entry[0] !== "FORCE_COLOR" && entry[0] !== "NO_COLOR",
  ),
);
const playwrightOutputRoot = path.join(workspaceRoot, "output", "playwright");
// Containers reuse PIDs; a run nonce prevents a later invocation from seeding an old database.
const runId = `${process.pid}-${randomUUID()}`;
const e2eDatabasePath = path.join(playwrightOutputRoot, "e2e", `internal-site-${runId}.db`);
const e2ePublishedRoot = path.join(workspaceRoot, "output", "playwright", "e2e", "published");
const viewerTests = [
  "viewer.spec.ts",
  "viewer-controls.spec.ts",
  "heatmap.spec.ts",
  "runtime-recovery.spec.ts",
  "navigation.spec.ts",
];
const publicTests = ["public-site.spec.ts", ...viewerTests];
const internalTests = [
  "internal-site.spec.ts",
  "catalog.spec.ts",
  "workspace.spec.ts",
  "workspace-actions.spec.ts",
  "upload.spec.ts",
  "upload-controls.spec.ts",
  "deploy.spec.ts",
  ...viewerTests,
];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  timeout: 30_000,
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
    ...["internal", "public"].flatMap((variant) => [
      {
        name: `${variant}-mobile-chromium`,
        testMatch: variant === "internal" ? internalTests : publicTests,
        metadata: { variant },
        use: {
          ...devices["Pixel 7"],
          baseURL: `http://localhost:${variant === "internal" ? 3100 : 3101}`,
        },
      },
      {
        name: `${variant}-mobile-webkit`,
        testMatch: variant === "internal" ? internalTests : publicTests,
        metadata: { variant },
        use: {
          ...devices["iPhone 13"],
          baseURL: `http://localhost:${variant === "internal" ? 3100 : 3101}`,
        },
      },
    ]),
    {
      name: "internal-chromium",
      testMatch: internalTests,
      metadata: { variant: "internal" },
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3100" },
    },
    {
      name: "public-chromium",
      testMatch: publicTests,
      metadata: { variant: "public" },
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3101" },
    },
  ],
  webServer: [
    {
      command: "pnpm exec tsx tests/e2e/support/start-server.ts assets",
      url: "http://127.0.0.1:3102/health",
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec tsx tests/e2e/support/start-server.ts internal",
      url: "http://localhost:3100",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...inheritedEnvironment,
        PORT: "3100",
        MAGIC_COMPARE_NEXT_DIST_DIR: ".next-e2e",
        DATABASE_URL: `file:${e2eDatabasePath}`,
        MAGIC_COMPARE_PUBLISHED_ROOT: path.join(
          playwrightOutputRoot,
          "e2e",
          `internal-published-${runId}`,
        ),
        MAGIC_COMPARE_PUBLIC_EXPORT_DIR: path.join(
          playwrightOutputRoot,
          "e2e",
          `internal-export-${runId}`,
        ),
        MAGIC_COMPARE_PUBLIC_SITE_BASE_URL: "http://localhost:3101",
        MAGIC_COMPARE_S3_REGION: "us-east-1",
        MAGIC_COMPARE_HIDE_DEMO: "true",
        MAGIC_COMPARE_S3_BUCKET: "e2e",
        MAGIC_COMPARE_S3_ENDPOINT: "http://127.0.0.1:3102",
        MAGIC_COMPARE_S3_INTERNAL_PREFIX: "",
        MAGIC_COMPARE_S3_FORCE_PATH_STYLE: "true",
        MAGIC_COMPARE_S3_PUBLIC_BASE_URL: "http://127.0.0.1:3102",
        MAGIC_COMPARE_S3_ACCESS_KEY_ID: "e2e-local",
        MAGIC_COMPARE_S3_SECRET_ACCESS_KEY: "e2e-local",
      },
    },
    {
      command: "pnpm exec tsx tests/e2e/support/start-server.ts public",
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
