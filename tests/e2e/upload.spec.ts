import path from "node:path";
import { expect, test, waitForStage } from "./support/browser-test";

/** Uses real app endpoints and SQLite with a disposable HTTP object-storage double. */
test("folder upload recovers from completion failure without uploading committed files again", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const slug = `browser-upload-${testInfo.project.name}-${testInfo.retry}`;
  await page.goto("/upload?case=e2e-sample");
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve("output/playwright/e2e/upload-source"));
  await expect(page.getByRole("button", { name: "开始上传", exact: true })).toBeEnabled();
  await page.getByRole("textbox", { name: "Slug", exact: true }).fill(slug);
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("Browser upload");
  let uploads = 0;
  page.on("request", (request) => {
    if (request.method() === "PUT") uploads++;
  });
  await page.route(
    "**/api/ops/group-upload-complete",
    (route) => route.fulfill({ status: 503, json: { error: "E2E completion unavailable" } }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "开始上传", exact: true }).click();
  await expect(page.getByRole("button", { name: "继续上传", exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await expect(
    page.getByText("E2E completion unavailable", { exact: false }).first(),
  ).toBeVisible();
  const completedPuts = uploads;
  expect(completedPuts).toBeGreaterThanOrEqual(4);
  await page.getByRole("button", { name: "继续上传", exact: true }).click();
  await expect(page.getByRole("button", { name: "打开图组", exact: true })).toBeEnabled();
  expect(uploads).toBe(completedPuts);
  await page.getByRole("button", { name: "打开图组", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/e2e-sample/groups/${slug}$`));
  await waitForStage(page);
});
