import { expect, test, expectPageFits } from "./support/browser-test";

test("empty catalog offers project creation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "还没有项目", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "创建", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expectPageFits(page);
});
