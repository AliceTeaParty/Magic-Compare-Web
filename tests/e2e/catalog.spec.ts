import { expect, test, openNavigation, expectPageFits } from "./support/browser-test";

test("catalog select icons stay left while labels stay centered across widths", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ["筛选项目状态", "项目排序"]) {
      const { offset, iconInset, iconGap, controlWidth } = await page
        .getByRole("combobox", { name })
        .evaluate((select) => {
          const root = select.closest(".MuiFilledInput-root");
          const content = select.querySelector("[data-catalog-select-value]");
          const icon = root?.querySelector(".MuiSvgIcon-root:not(.MuiSelect-icon)");
          if (!root || !content || !icon)
            return { offset: Infinity, iconInset: Infinity, iconGap: -Infinity, controlWidth: 0 };
          const control = root.getBoundingClientRect();
          const value = content.getBoundingClientRect();
          const leadingIcon = icon.getBoundingClientRect();
          return {
            offset: Math.abs(value.x + value.width / 2 - control.x - control.width / 2),
            iconInset: leadingIcon.x - control.x,
            iconGap: value.left - leadingIcon.right,
            controlWidth: control.width,
          };
        });
      expect(offset, `${name} at ${width}px`).toBeLessThanOrEqual(1);
      expect(iconInset, `${name} at ${width}px`).toBeGreaterThanOrEqual(12);
      expect(iconInset, `${name} at ${width}px`).toBeLessThanOrEqual(18);
      expect(iconGap, `${name} at ${width}px`).toBeGreaterThanOrEqual(4);
      if (width === 320) expect(controlWidth, `${name} at ${width}px`).toBeGreaterThan(200);
    }
    await expectPageFits(page);
  }
});

test("catalog search, status, sort and empty search recover without leaving the page", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "搜索项目" });
  await search.fill("e2e-sample");
  await expect(page.locator('a[href="/cases/e2e-sample"]').first()).toBeVisible();
  await search.fill("no-such-case-query");
  await expect(page.getByRole("heading", { name: "没有匹配的项目" })).toBeVisible();
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(search).toHaveValue("");
  await page.getByRole("combobox", { name: "筛选项目状态" }).click();
  await page.getByRole("option", { name: "已归档", exact: true }).click();
  await expect(page.getByRole("heading", { name: "没有匹配的项目" })).toBeVisible();
  await page.getByRole("button", { name: "清除筛选" }).click();
  await search.fill("catalog-fixture");
  for (const order of ["标题", "最早更新", "最近更新"]) {
    await page.getByRole("combobox", { name: "项目排序" }).click();
    await page.getByRole("option", { name: order, exact: true }).click();
    await expect(page.getByRole("combobox", { name: "项目排序" })).toHaveText(order);
    await expect(page.getByRole("heading", { level: 3 }).first()).toHaveText(
      order === "最近更新" ? "Catalog zeta" : "Catalog alpha",
    );
  }
  await search.fill("e2e-sample");
  await expectPageFits(page);
  await page.locator('a[href="/cases/e2e-sample"]').first().click();
  // The first workspace visit compiles its Next dev route; wait for navigation, not a 5s UI assertion.
  await page.waitForURL(/\/cases\/e2e-sample$/);
});

test("create dialog validates description, retains failed drafts and resets on cancel", async ({
  page,
}) => {
  await page.goto("/");
  await openNavigation(page);
  const create = page.getByRole("button", { name: "新建", exact: true }).filter({ visible: true });
  await create.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("标题", { exact: true }).fill("Draft case");
  await dialog.getByLabel("描述", { exact: true }).fill("x".repeat(161));
  await expect(dialog.getByRole("button", { name: "创建", exact: true })).toBeDisabled();
  await dialog.getByLabel("描述", { exact: true }).fill("Valid description");
  await page.route("**/api/ops/case-create", (route) =>
    route.fulfill({ status: 409, json: { error: "E2E duplicate case" } }),
  );
  await dialog.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.getByText("E2E duplicate case", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("标题", { exact: true })).toHaveValue("Draft case");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await create.click();
  await expect(dialog.getByLabel("标题", { exact: true })).toHaveValue("");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.keyboard.press("Escape");
  await expectPageFits(page);
});
