import { expect, test } from "./support/browser-test";

test("public viewer exposes and loads both original stage images", async ({ page, request }) => {
  const response = await request.get("/g/e2e-sample--viewer");
  expect(response.ok()).toBe(true);
  const initialHtml = await response.text();
  // Raw HTML proves original discovery happens before hydration; thumbnail requests cannot satisfy
  // this contract or make the browser test pass accidentally.
  const stageImageTags = initialHtml.match(/<img[^>]+data-viewer-stage-image[^>]*>/gi) ?? [];
  expect(stageImageTags).toHaveLength(2);
  // The site starts in A/B with Rip visible. Src remains discoverable but does not compete
  // with the visible original for the first useful full-size image on slow connections.
  const highPriorityImages = stageImageTags.filter((tag) => /fetchpriority="high"/i.test(tag));
  expect(highPriorityImages).toHaveLength(1);
  expect(highPriorityImages[0]).toContain('alt="Rip image"');
  expect(stageImageTags.filter((tag) => /fetchpriority="low"/i.test(tag))).toHaveLength(1);
  // A/B paints one original at a time, so only its active image needs a mosaic preview.
  expect(initialHtml.match(/data-viewer-stage-placeholder/g)).toHaveLength(1);
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
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0 &&
            image.naturalHeight > 0,
        ),
      ),
    )
    .toBe(true);
});
