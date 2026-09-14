import { expect, test, viewerPath, waitForStage, expectPageFits } from "./support/browser-test";

test("first-run guide completes, stays dismissed and can be reopened", async ({ page }, info) => {
  await page.goto(viewerPath(info.project.metadata.variant));
  await page.getByRole("button", { name: "引导", exact: true }).click();
  await expect(page.getByText("快速引导", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.reload();
  await waitForStage(page);
  await expect(page.getByRole("button", { name: "跳过", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "查看引导", exact: true }).click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expectPageFits(page);
});

test("comparison variables, image selector and nearest-neighbor preferences remain usable", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem("magic_compare_viewer_guide_v1", "dismissed"),
  );
  await page.goto(viewerPath(info.project.metadata.variant));
  await page.getByRole("button", { name: "使用 Flt 作为对比变量", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "使用 Flt 作为对比变量", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await waitForStage(page);
  await page.getByRole("button", { name: "A / B", exact: true }).click();
  await page.getByRole("combobox", { name: "选择 A/B 图片" }).click();
  await page.getByRole("option", { name: "Flt", exact: true }).click();
  await page.getByRole("button", { name: /A\/B inspect stage/ }).click();
  await expect(page.getByRole("button", { name: /A\/B inspect stage/ })).toHaveAttribute(
    "aria-label",
    /Showing Flt/,
  );
  const plus = page.getByRole("button", { name: "放大 A/B 视图", exact: true });
  await plus.click();
  await plus.click();
  const disable = page.getByRole("button", { name: "关闭 A/B 最近邻采样", exact: true });
  await expect(disable).toBeVisible();
  await disable.click();
  const prompt = page.getByRole("region", { name: "最近邻采样自动开启设置" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "不再自动", exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await page.getByRole("button", { name: "缩小 A/B 视图", exact: true }).click();
  await page.keyboard.press("r");
  await expectPageFits(page);
});
