import { expect, test, openNavigation, expectPageFits } from "./support/browser-test";

test("deployment panel restores progress, reopens without duplicate jobs and retries failure", async ({
  page,
}) => {
  let starts = 0;
  const job = {
    id: "e2e-deploy",
    status: "running",
    stage: "building",
    stageSequence: ["building", "uploading"],
    completedStageCount: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    elapsedMs: 1000,
    stageDurationsMs: {},
    uploadProgress: null,
    projectName: "E2E Pages",
    branch: "test",
    publicSiteUrl: "https://example.invalid",
    skipped: false,
    error: "",
  };
  await page.route("**/api/ops/public-deploy**", (route) => {
    if (route.request().method() === "POST") {
      starts++;
      job.status = "succeeded";
    }
    return route.fulfill({ json: { job, reused: false } });
  });
  await page.goto("/");
  await expect(page.getByText("同步并构建公开页面", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "收起部署进度" }).click();
  await openNavigation(page);
  await page.getByRole("button", { name: "部署", exact: true }).filter({ visible: true }).click();
  await expect(page.getByText("同步并构建公开页面", { exact: true })).toBeVisible();
  expect(starts).toBe(0);
  job.status = "failed";
  job.error = "E2E deploy failed";
  await expect(page.getByRole("button", { name: "重新部署" })).toBeVisible();
  await page.getByRole("button", { name: "重新部署" }).click();
  await expect(page.getByText("部署完成", { exact: true })).toBeVisible();
  expect(starts).toBe(1);
  await expect(page.getByRole("link", { name: "打开部署结果" })).toHaveAttribute(
    "href",
    "https://example.invalid",
  );
  await expectPageFits(page);
});

test("deployment start failure is visible and a no-change job completes honestly", async ({
  page,
}) => {
  await page.goto("/");
  await openNavigation(page);
  await page.getByRole("button", { name: "部署", exact: true }).filter({ visible: true }).click();
  await expect(page.getByText("No E2E deployment job", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "收起部署进度" })).toHaveCount(0);
  await page.route("**/api/ops/public-deploy**", (route) =>
    route.fulfill({
      json: {
        job: {
          id: "unchanged",
          status: "succeeded",
          stage: "checking",
          stageSequence: ["checking"],
          completedStageCount: 1,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          elapsedMs: 10,
          stageDurationsMs: {},
          uploadProgress: null,
          projectName: "E2E Pages",
          branch: null,
          publicSiteUrl: null,
          skipped: true,
          error: null,
        },
      },
    }),
  );
  await openNavigation(page);
  await page.getByRole("button", { name: "部署", exact: true }).filter({ visible: true }).click();
  await expect(page.getByText("公开站点无需更新", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "打开部署结果" })).toHaveCount(0);
});
