import { expect, test, openSettings, expectPageFits } from "./support/browser-test";
import { createManagementCase, createDraftGroup } from "./support/management-fixture";
import type { Page } from "@playwright/test";

/** Finish the mutation's RSC refresh before testing a separate full-page reload in Firefox. */
async function workspaceRefreshed(page: Page) {
  const currentPath = new URL(page.url()).pathname;
  const response = await page.waitForResponse(
    (response) =>
      response.request().headers()["rsc"] === "1" &&
      new URL(response.url()).pathname === currentPath,
  );
  await response.finished();
}

test("settings validation, failed save, cancellation and empty-case deletion", async ({
  page,
  request,
}, info) => {
  const slug = await createManagementCase(request, info, "settings");
  await page.goto(`/cases/${slug}`);
  await expect(page.getByRole("heading", { name: "还没有图组" })).toBeVisible();
  await openSettings(page);
  const title = page.getByRole("textbox", { name: "标题", exact: true }).filter({ visible: true });
  const save = page
    .getByRole("button", { name: "保存设置", exact: true })
    .filter({ visible: true });
  await expect(save).toBeDisabled();
  await title.fill("");
  await expect(save).toBeDisabled();
  await title.fill("Retained draft");
  await page.route(
    "**/api/ops/case-update",
    (route) => route.fulfill({ status: 503, json: { error: "E2E settings unavailable" } }),
    { times: 1 },
  );
  await save.click();
  await expect(page.getByText("E2E settings unavailable", { exact: true })).toBeVisible();
  await expect(title).toHaveValue("Retained draft");
  const close = page.getByRole("button", { name: "关闭项目设置" }).filter({ visible: true });
  if (await close.isVisible()) {
    await close.click();
    await openSettings(page);
    await expect(title).toHaveValue(slug);
  }
  const remove = page
    .getByRole("button", { name: "删除项目", exact: true })
    .filter({ visible: true });
  await remove.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("删除项目？");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await remove.click();
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expectPageFits(page);
});

test("group visibility failure rolls back and recovery persists", async ({ page, request }) => {
  expect(
    (
      await request.post("/api/ops/group-visibility", {
        data: { caseSlug: "e2e-sample", groupSlug: "viewer", isPublic: false },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/cases/e2e-sample");
  const row = page
    .getByRole("listitem")
    .filter({ has: page.locator('a[href="/cases/e2e-sample/groups/viewer"]') });
  await page.route(
    "**/api/ops/group-visibility",
    (route) => route.fulfill({ status: 503, json: { error: "E2E visibility unavailable" } }),
    { times: 1 },
  );
  await row.getByRole("button", { name: "公开", exact: true }).click();
  await expect(page.getByText("E2E visibility unavailable", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "内部", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const published = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/ops/group-visibility") &&
      response.request().method() === "POST",
  );
  const publishedRefresh = workspaceRefreshed(page);
  await row.getByRole("button", { name: "公开", exact: true }).click();
  expect((await published).ok()).toBe(true);
  await publishedRefresh;
  await expect(row.getByRole("button", { name: "公开", exact: true })).toBeEnabled();
  await page.reload();
  await expect(row.getByRole("button", { name: "公开", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await row.getByRole("button", { name: "内部", exact: true }).click();
  await expect(row.getByRole("button", { name: "内部", exact: true })).toBeEnabled();
  await openSettings(page);
  await expect(
    page.getByRole("button", { name: "删除项目", exact: true }).filter({ visible: true }),
  ).toBeDisabled();
  await page.goto("/cases/e2e-sample/groups/viewer");
  await page.getByRole("button", { name: "打开详情", exact: true }).click();
  // Hiding a group retains its former slug in storage; the viewer must not offer a dead public link.
  await expect(page.getByText(/当前图组未公开/)).toBeVisible();
  await expect(page.getByRole("link", { name: /打开公开 Slug/ })).toHaveCount(0);
});

test("group drag saves order, delete cancels and recovers after failure", async ({
  page,
  request,
}, info) => {
  const slug = await createManagementCase(request, info, "groups");
  for (const [index, name] of ["Group A", "Group B"].entries()) {
    await createDraftGroup(request, slug, name.toLowerCase().replace(" ", "-"), index);
  }
  await page.goto(`/cases/${slug}/groups/group-a`);
  await expect(
    page.getByText("This frame is missing its before/after pair.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "打开详情", exact: true }).click();
  await page
    .getByRole("link", { name: /group-b/ })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/cases/${slug}/groups/group-b$`));
  await page.goto(`/cases/${slug}`);
  const rows = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "删除图组" }) });
  const handles = rows.getByRole("button", { name: "拖动调整此项目内的顺序。", exact: true });
  await handles.first().scrollIntoViewIfNeeded();
  const first = (await handles.first().boundingBox())!;
  const last = (await handles.last().boundingBox())!;
  const reordered = page.waitForResponse(
    (r) => r.url().endsWith("/api/ops/group-reorder") && r.request().method() === "POST",
  );
  const reorderRefresh = workspaceRefreshed(page);
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 15 });
  await page.mouse.up();
  expect((await reordered).ok()).toBe(true);
  await reorderRefresh;
  await page.reload();
  await expect(rows.first()).toContainText("group-b");
  await rows.first().getByRole("button", { name: "删除图组" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await page.route(
    "**/api/ops/group-delete",
    (route) => route.fulfill({ status: 503, json: { error: "E2E delete unavailable" } }),
    { times: 1 },
  );
  await rows.first().getByRole("button", { name: "删除图组" }).click();
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByText("E2E delete unavailable", { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(2);
  await rows.first().getByRole("button", { name: "删除图组" }).click();
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expectPageFits(page);
});
