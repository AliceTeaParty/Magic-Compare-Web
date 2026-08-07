import { expect, test } from "@playwright/test";

test("public viewer exposes and loads both original stage images", async ({ page, request }) => {
  const response = await request.get("/g/e2e-sample--viewer");
  expect(response.ok()).toBe(true);
  const initialHtml = await response.text();
  // Raw HTML proves original discovery happens before hydration; thumbnail requests cannot satisfy
  // this contract or make the browser test pass accidentally.
  expect(initialHtml.match(/data-viewer-stage-image/g)).toHaveLength(2);
  expect(initialHtml.match(/fetchpriority="high"/gi)).toHaveLength(3);
  expect(initialHtml).toContain('width="640"');
  expect(initialHtml).toContain('height="360"');

  await page.goto("/g/e2e-sample--viewer");
  await expect(page.getByText("E2E Viewer", { exact: true })).toBeVisible();
  await expect(page.getByText("E2E Sample", { exact: true })).toBeVisible();

  const stageImages = page.locator("[data-viewer-stage-image]");
  await expect(stageImages).toHaveCount(2);
  await expect(stageImages.first()).toBeVisible();
  await expect
    .poll(() =>
      stageImages.evaluateAll((images) =>
        images.every(
          (image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
        ),
      ),
    )
    .toBe(true);
});
