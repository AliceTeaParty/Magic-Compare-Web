import path from "node:path";
import { expect, test, openInternalPage, dismissNotifications } from "./support/browser-test";

test.use({ baseURL: "http://localhost:3100" });

// Directory selection and pairing belong to the desktop upload workbench.
for (const mode of ["light", "dark"] as const) {
  test(`desktop upload surfaces in ${mode}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("mc-internal-mode", value), mode);
    await page
      .context()
      .addCookies([{ name: "mc_internal_theme", value: "coral", url: "http://localhost:3100" }]);
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
