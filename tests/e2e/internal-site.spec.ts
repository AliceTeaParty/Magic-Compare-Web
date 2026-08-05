import { expect, test } from "@playwright/test";

test("internal workspace shell navigates to the upload workbench", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Case", exact: true })).toBeVisible();

  await page.locator('a[href="/upload"]').first().click();
  await expect(page).toHaveURL(/\/upload$/);
  await expect(page.getByRole("heading", { name: "上传对比", exact: true })).toBeVisible();
});
