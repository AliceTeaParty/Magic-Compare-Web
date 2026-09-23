import { expect, test, openNavigation, viewerPath, expectPageFits } from "./support/browser-test";

test("public shell keeps display controls in its footer instead of an empty navigation menu", async ({
  page,
}, info) => {
  test.skip(
    info.project.metadata.variant !== "public",
    "Internal pages retain their working navigation.",
  );

  await page.goto(viewerPath(info.project.metadata.variant));
  await expect(page.getByRole("button", { name: "打开导航", exact: true })).toHaveCount(0);

  const footer = page.locator("footer");
  await expect(footer.getByRole("button", { name: "选择主题色" })).toBeVisible();
  await expect(footer.getByText(/^v\d/, { exact: false })).toBeVisible();
  await expect(footer.getByText(/© .*All Rights Reserved\./)).toBeVisible();
  await expectPageFits(page);
});

test("navigation, theme presets, custom color and dark mode survive reload", async ({
  page,
}, info) => {
  await page.goto(viewerPath(info.project.metadata.variant));
  await openNavigation(page);
  const palette = page.getByRole("button", { name: "选择主题色" }).filter({ visible: true });
  await palette.click();
  const presets = page.getByRole("button", { name: /^使用.+主题$/ });
  // The portal can mount after the palette click; wait for all options before iterating.
  await expect.poll(() => presets.count()).toBeGreaterThan(1);
  const count = await presets.count();
  for (let index = 0; index < count; index++) {
    await presets.nth(index).click();
    await expectPageFits(page);
  }
  await page.getByLabel("选择自定义主题色").fill("#5588aa");
  await page.keyboard.press("Escape");
  const toggle = page.getByRole("switch", { name: "切换明暗模式" }).filter({ visible: true });
  if (await toggle.isVisible()) await toggle.setChecked(true);
  else
    await page
      .getByRole("button", { name: "切换为深色", exact: true })
      .filter({ visible: true })
      .click();
  await expect(page.locator("html")).toHaveAttribute("data-dark", "");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-dark", "");
  await openNavigation(page);
  await palette.click();
  await expect(page.getByLabel("选择自定义主题色")).toHaveValue("#5588aa");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expectPageFits(page);
});

test("responsive navigation releases its overlay when switching to the desktop rail", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(viewerPath(info.project.metadata.variant));
  await openNavigation(page);
  await expect(
    page.getByRole("button", { name: "选择主题色" }).filter({ visible: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".MuiDrawer-modal")).toHaveCount(0);
  await page.getByRole("button", { name: "查看引导", exact: true }).click();
  await page.getByRole("button", { name: "关闭引导", exact: true }).click();
  await expectPageFits(page);
});

test("missing routes render the correct error surface", async ({ page }, info) => {
  const isPublic = info.project.metadata.variant === "public";
  await page.goto(isPublic ? "/" : "/cases/e2e-does-not-exist");
  await expect(
    page.getByRole("heading", { name: isPublic ? "未找到图组" : "404", exact: true }),
  ).toBeVisible();
  await expectPageFits(page);
  if (isPublic) {
    await expect(page.getByRole("button", { name: "新建", exact: true })).toHaveCount(0);
    await page.goto("/g/e2e-does-not-exist");
    await expect(page.getByRole("heading", { name: "未找到图组", exact: true })).toBeVisible();
  }
});
