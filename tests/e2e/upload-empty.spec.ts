import { expect, test, expectPageFits } from "./support/browser-test";

test("desktop upload intake handles no available projects", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "前往上传", exact: true }).click();
  await expect(page.getByRole("heading", { name: "上传对比", exact: true })).toBeVisible();
  // Route transitions can retain an aria-hidden copy; assert the accessible intake surface.
  await expect(page.getByRole("paragraph").filter({ hasText: /^尚无项目$/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新建项目", exact: true }).filter({ visible: true }),
  ).toBeEnabled();
  await expectPageFits(page);
});
