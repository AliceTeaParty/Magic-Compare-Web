import { expect, test, openNavigation, openSettings } from "./support/browser-test";

/** Exercises the real API/database, with temporary routes only for deliberate failures. */
test("case creation validates input and persists settings", async ({ page }, testInfo) => {
  const slug = `e2e-create-${testInfo.project.name}-${testInfo.retry}`;
  await page.goto("/");
  await openNavigation(page);
  await page.getByRole("button", { name: "新建", exact: true }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建项目", exact: true });
  await expect(dialog.getByRole("button", { name: "创建", exact: true })).toBeDisabled();
  await dialog.getByLabel("标题", { exact: true }).fill("Browser case");
  await dialog.getByLabel("Slug", { exact: true }).fill(slug);
  await dialog.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/${slug}$`));
  await expect(dialog).toBeHidden();
  // The exiting create modal otherwise consumes Escape intended for the navigation underneath.
  await expect(page.locator(".MuiDialog-root")).toHaveCount(0);
  // Creation can leave the mobile navigation drawer mounted while the route changes.
  await page.keyboard.press("Escape");
  await openSettings(page);
  const title = page.getByRole("textbox", { name: "标题", exact: true }).filter({ visible: true });
  await title.fill("Browser case saved");
  await page
    .getByRole("button", { name: "保存设置", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByText("项目设置已保存。", { exact: true })).toBeVisible();
  await page.reload();
  await openSettings(page);
  await expect(title).toHaveValue("Browser case saved");
});

test.describe("group inline editing", () => {
  test.beforeEach(async ({ request, page }) => {
    const restored = await request.post("/api/ops/group-update", {
      data: {
        caseSlug: "e2e-sample",
        groupSlug: "viewer",
        title: "E2E Viewer",
        description: "Deterministic fixture",
      },
    });
    expect(restored.ok()).toBe(true);
    await page.goto("/cases/e2e-sample");
  });

  test("cancel keeps committed text; consecutive saves persist without moving the row", async ({
    page,
  }) => {
    const row = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: "编辑图组", exact: true }) })
      .first();
    const before = await row.boundingBox();
    await page.getByRole("button", { name: "编辑图组", exact: true }).first().click();
    await page.getByRole("textbox", { name: "图组标题", exact: true }).fill("Cancelled title");
    await page.getByRole("button", { name: "取消编辑图组元数据", exact: true }).click();
    await expect(page.getByText("Cancelled title", { exact: true })).toHaveCount(0);
    await expect(page.getByText("E2E Viewer", { exact: true })).toBeVisible();
    for (const title of ["First saved title", "Second saved title"]) {
      await page.getByRole("button", { name: "编辑图组", exact: true }).first().click();
      await page.getByRole("textbox", { name: "图组标题", exact: true }).fill(title);
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/ops/group-update") &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "保存图组元数据", exact: true }).click();
      expect((await saved).ok()).toBe(true);
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      expect((await row.boundingBox())!.height).toBeCloseTo(before!.height, 0);
    }
    await page.reload();
    await expect(page.getByText("Second saved title", { exact: true })).toBeVisible();
  });

  test("failed save rolls back visibly and a new edit can recover", async ({ page }) => {
    await page.route(
      "**/api/ops/group-update",
      (route) => route.fulfill({ status: 503, json: { error: "E2E save unavailable" } }),
      { times: 1 },
    );
    await page.getByRole("button", { name: "编辑图组", exact: true }).first().click();
    await page.getByRole("textbox", { name: "图组标题", exact: true }).fill("Rejected title");
    await page.getByRole("button", { name: "保存图组元数据", exact: true }).click();
    await expect(page.getByText("E2E save unavailable", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E Viewer", { exact: true })).toBeVisible();
    await expect(page.getByText("Rejected title", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "编辑图组", exact: true }).first().click();
    await expect(page.getByRole("textbox", { name: "图组标题", exact: true })).toHaveText(
      "E2E Viewer",
    );
    await page.getByRole("textbox", { name: "图组标题", exact: true }).fill("Recovered title");
    await page.getByRole("button", { name: "保存图组元数据", exact: true }).click();
    await expect(page.getByText("图组元数据已保存。", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Recovered title", { exact: true })).toBeVisible();
  });
});
