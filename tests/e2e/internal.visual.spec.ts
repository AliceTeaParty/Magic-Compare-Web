import { expect, test, openSettings, openInternalPage } from "./support/browser-test";

test.use({ baseURL: "http://localhost:3100" });

// Whole-page baselines catch regressions in navigation, content panes, and settings forms.
for (const mode of ["light", "dark"] as const) {
  test(`internal catalog and workspace surfaces in ${mode}`, async ({ page }) => {
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
  });
}
