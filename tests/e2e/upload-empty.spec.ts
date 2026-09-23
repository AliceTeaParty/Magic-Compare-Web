import path from "node:path";
import { expect, test, expectPageFits } from "./support/browser-test";

test("desktop upload intake handles no available projects", async ({ page }) => {
  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: "上传对比", exact: true })).toBeVisible();
  // Project selection is intentionally deferred until a source folder has been scanned.
  await expect(page.getByRole("button", { name: "选择文件夹", exact: true })).toBeVisible();
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve("output/playwright/e2e/upload-source"));
  await expect(page.getByText("上传前需要创建项目。", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新建项目", exact: true }).filter({ visible: true }),
  ).toBeEnabled();
  await expectPageFits(page);
});
