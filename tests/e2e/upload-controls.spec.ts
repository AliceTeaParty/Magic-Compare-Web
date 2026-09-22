import path from "node:path";
import { expect, test, expectPageFits } from "./support/browser-test";

test("upload source, metadata, title mode, column editing and abandon controls", async ({
  page,
}, info) => {
  await page.goto("/upload");
  await expect(page.getByRole("button", { name: "选择文件夹", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "目标项目" }).click();
  await page.getByRole("option", { name: /E2E Sample/ }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve("output/playwright/e2e/upload-multiple-source"));
  await expect(page.getByRole("button", { name: "开始上传", exact: true })).toBeEnabled();
  await page
    .getByRole("textbox", { name: "Slug", exact: true })
    .fill(`controls-${info.project.name}-${info.retry}`);
  await page.getByRole("button", { name: "文件名 Frame 标题" }).click();
  await expect(page.getByRole("button", { name: "文件名 Frame 标题" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "自动 Frame 标题" }).click();
  await page.getByRole("combobox", { name: "热图参考变量" }).click();
  await page.getByRole("option", { name: "Heatmap: Flt", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "热图参考变量" })).toHaveText("Heatmap: Flt");
  const previews = page.getByRole("button", { name: /^预览 / });
  await previews.first().press("Enter");
  await expect(previews.first()).toHaveAttribute("aria-expanded", "true");
  await previews.first().press("Enter");
  await expect(previews.first()).toHaveAttribute("aria-expanded", "false");
  // Collapse unmounts after its exit transition; measure the final rows for pointer sorting.
  await expect(page.getByRole("img", { name: "00_00_1 Src", exact: true })).toHaveCount(0);
  const lastTitle = await previews.last().getAttribute("aria-label");
  const handles = page.getByRole("button", { name: "拖动调整上传顺序", exact: true });
  await handles.first().scrollIntoViewIfNeeded();
  await handles.first().click({ trial: true });
  const first = (await handles.first().boundingBox())!;
  const last = (await handles.last().boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2 + 10);
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(previews.first()).toHaveAttribute("aria-label", lastTitle!);
  // dnd-kit keeps its capture-phase click listener for this exact cleanup window after a drop.
  await page.waitForTimeout(50);
  await page.getByRole("button", { name: "编辑 Src 列名" }).click();
  const label = page.getByRole("textbox", { name: "编辑 Src 列名" });
  await label.fill("Original");
  await page.getByRole("button", { name: "取消编辑列名" }).click();
  await expect(page.getByRole("button", { name: "编辑 Src 列名" })).toBeVisible();
  await page.getByRole("button", { name: "编辑 Src 列名" }).click();
  await label.fill("Original");
  await page.getByRole("button", { name: "保存列名" }).click();
  await expect(page.getByRole("button", { name: "编辑 Original 列名" })).toBeVisible();
  await page.getByRole("button", { name: "热图", exact: true }).click();
  await expectPageFits(page);
  await page.route("**/api/ops/group-upload-complete", (route) =>
    route.fulfill({ status: 503, json: { error: "E2E stop before complete" } }),
  );
  await page.getByRole("button", { name: "开始上传", exact: true }).click();
  await expect(page.getByRole("button", { name: "继续上传", exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await expect(page.getByText("E2E stop before complete", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "上传操作" }).click();
  await page.getByRole("menuitem", { name: "放弃本次上传" }).click();
  await expect(page.getByRole("button", { name: "选择文件夹", exact: true })).toBeVisible();
});

test("invalid pairing blocks upload and reselecting a directory recovers", async ({ page }) => {
  await page.goto("/upload?case=e2e-sample");
  const input = page.locator('input[type="file"]');
  await input.setInputFiles(path.resolve("output/playwright/e2e/upload-invalid-source"));
  await expect(page.getByRole("button", { name: "开始上传", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "重新选择文件夹" })).toBeEnabled();
  await input.setInputFiles(path.resolve("output/playwright/e2e/upload-source"));
  await expect(page.getByRole("button", { name: "开始上传", exact: true })).toBeEnabled();
  await expectPageFits(page);
});

test("pause interrupts active upload and the upload menu abandons the session", async ({
  page,
}, info) => {
  await page.goto("/upload?case=e2e-sample");
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve("output/playwright/e2e/upload-source"));
  await page
    .getByRole("textbox", { name: "Slug", exact: true })
    .fill(`paused-${info.project.name}-${info.retry}`);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("http://127.0.0.1:3102/**", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    await gate;
    await route.abort();
  });
  try {
    const put = page.waitForRequest((request) => request.method() === "PUT");
    await page.getByRole("button", { name: "开始上传", exact: true }).click();
    await put;
    await page.getByRole("button", { name: "暂停上传", exact: true }).click();
    await expect(page.getByRole("button", { name: "继续上传", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "上传操作" }).click();
    await page.getByRole("menuitem", { name: "放弃本次上传" }).click();
    await expect(page.getByRole("button", { name: "选择文件夹", exact: true })).toBeVisible();
  } finally {
    release();
  }
});
