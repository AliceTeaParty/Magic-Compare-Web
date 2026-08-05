import { expect, test } from "@playwright/test";

test("public viewer renders its fixture and loads the comparison images", async ({ page }) => {
  await page.goto("/g/e2e-sample--viewer");
  await expect(page.getByText("E2E Viewer", { exact: true })).toBeVisible();
  await expect(page.getByText("E2E Sample", { exact: true })).toBeVisible();

  const stageImages = page.locator("img");
  await expect(stageImages.first()).toBeVisible();
  await expect
    .poll(() =>
      stageImages.evaluateAll((images) =>
        images.some((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
      ),
    )
    .toBe(true);
});
