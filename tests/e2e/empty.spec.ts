import { expect, test, expectPageFits } from "./support/browser-test";

test("empty catalog offers creation and upload intake handles no available projects", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "还没有项目", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "创建", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("link", { name: "前往上传", exact: true }).click();
  await expect(page.getByRole("heading", { name: "上传对比", exact: true })).toBeVisible();
  // Route transitions can retain an aria-hidden copy; assert the accessible intake surface.
  await expect(page.getByRole("paragraph").filter({ hasText: /^尚无项目$/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新建项目", exact: true }).filter({ visible: true }),
  ).toBeEnabled();
  await expectPageFits(page);
});
