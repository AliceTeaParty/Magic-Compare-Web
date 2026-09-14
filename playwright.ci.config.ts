import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import config from "./playwright.config";

// Keep installed Chrome opt-in locally; CI runs stable Chrome and macOS WebKit explicitly.
const browsers = [
  { name: "desktop-chrome", device: "Desktop Chrome", channel: "chrome" },
  { name: "desktop-firefox", device: "Desktop Firefox" },
  { name: "desktop-webkit", device: "Desktop Safari" },
  { name: "android-chrome", device: "Pixel 7", channel: "chrome" },
  { name: "ios-webkit", device: "iPhone 13" },
];

export default defineConfig({
  ...config,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "output/playwright/playwright-report" }],
    ["json", { outputFile: "output/playwright/results.json" }],
  ],
  projects: browsers.flatMap(({ name, device, channel }) =>
    ["internal", "public"].map((variant) => {
      const source = config.projects!.find((project) => project.name === `${variant}-chromium`)!;
      return {
        ...source,
        name: `${variant}-${name}`,
        // Every device exercises the site's complete suite, including responsive edit/upload UI.
        use: { ...source.use, ...devices[device], ...(channel ? { channel } : {}) },
      };
    }),
  ),
  outputDir: path.join(__dirname, "output/playwright/test-results"),
});
