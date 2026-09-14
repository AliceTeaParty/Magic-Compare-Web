import { expect, test, openNavigation } from "./support/browser-test";

test("internal workspace shell navigates to the upload workbench", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "项目", exact: true })).toBeVisible();

  await openNavigation(page);
  await page.locator('a[href="/upload"]').filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/upload$/);
  await expect(page.getByRole("heading", { name: "上传对比", exact: true })).toBeVisible();
});
