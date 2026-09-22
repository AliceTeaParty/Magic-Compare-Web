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
      // Inherit the device-specific suite so mobile jobs exclude desktop folder uploads.
      const sourceName = `${variant}-${devices[device].isMobile ? "mobile-" : ""}chromium`;
      const source = config.projects!.find((project) => project.name === sourceName)!;
      return {
        ...source,
        name: `${variant}-${name}`,
        use: { ...source.use, ...devices[device], ...(channel ? { channel } : {}) },
      };
    }),
  ),
  outputDir: path.join(__dirname, "output/playwright/test-results"),
});
