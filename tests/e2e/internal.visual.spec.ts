import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, openSettings, dismissNotifications } from "./support/browser-test";

test.use({ baseURL: "http://localhost:3100" });

/** Wait for shell hydration's restoration request before capturing or leaving an SSR page. */
async function openInternalPage(page: Page, url: string) {
  const restored = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/ops/public-deploy") && response.request().method() === "GET",
  );
  await page.goto(url);
  await (await restored).finished();
}

// Whole-page baselines catch regressions in navigation, content panes, forms and pairing tables.
for (const mode of ["light", "dark"] as const) {
  test(`internal catalog, workspace and upload surfaces in ${mode}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("mc-internal-mode", value), mode);
    await page
      .context()
      .addCookies([{ name: "mc_internal_theme", value: "coral", url: "http://localhost:3100" }]);
    await openInternalPage(page, "/");
    await expect(page.getByRole("heading", { name: "E2E Sample", exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot(`catalog-${mode}.png`, {
      fullPage: true,
      animations: "disabled",
    });
    await openInternalPage(page, "/cases/e2e-sample");
    await expect(page.getByRole("button", { name: "编辑图组", exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot(`workspace-${mode}.png`, {
      fullPage: true,
      animations: "disabled",
    });
    await openSettings(page);
    await expect(
      page.getByRole("textbox", { name: "标题", exact: true }).filter({ visible: true }),
    ).toHaveValue("E2E Sample");
    await expect(page).toHaveScreenshot(`settings-${mode}.png`, {
      fullPage: true,
      animations: "disabled",
    });
    await openInternalPage(page, "/upload?case=e2e-sample");
    await expect(page.getByRole("button", { name: "选择文件夹", exact: true })).toBeVisible();
    await dismissNotifications(page);
    await expect(page).toHaveScreenshot(`upload-intake-${mode}.png`, {
      fullPage: true,
      animations: "disabled",
    });
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.resolve("output/playwright/e2e/upload-multiple-source"));
    await expect(page.getByRole("button", { name: "开始上传", exact: true })).toBeEnabled();
    await dismissNotifications(page);
    await expect(page).toHaveScreenshot(`upload-pairing-${mode}.png`, {
      fullPage: true,
      animations: "disabled",
    });
  });
}
