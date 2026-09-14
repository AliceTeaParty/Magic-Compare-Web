import { expect, test, waitForStage } from "./support/browser-test";

// Baselines contain the image surface and controls only. Fixed fixtures and reduced motion keep
// visual regressions reviewable without hiding loading failures or accepting arbitrary delays.
for (const mode of ["light", "dark"] as const) {
  test(`neutral stage and theme controls in ${mode}`, async ({ page }, testInfo) => {
    await page.addInitScript((value) => {
      localStorage.setItem("magic_compare_viewer_guide_v1", "dismissed");
      localStorage.setItem("mc-internal-mode", value);
    }, mode);
    await page
      .context()
      .addCookies([{ name: "mc_internal_theme", value: "coral", url: "http://localhost:3101" }]);
    await page.goto("/g/e2e-sample--viewer");
    await waitForStage(page);
    const stage = page.getByTestId("viewer-stage");
    await stage.scrollIntoViewIfNeeded();
    const shell = stage.locator(":scope > div");
    await expect(shell).toHaveCSS("border-radius", "0px");
    // The inspection surround now shares the title surface in every theme, rather than fixed gray.
    await expect
      .poll(async () => {
        const surface = await shell.evaluate((node) => getComputedStyle(node).backgroundColor);
        const title = await page
          .getByRole("heading", { name: "E2E Viewer", exact: true })
          .evaluate((node) => {
            let parent: Element | null = node;
            while (parent) {
              const color = getComputedStyle(parent).backgroundColor;
              if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
              parent = parent.parentElement;
            }
            return "transparent";
          });
        return surface === title;
      })
      .toBe(true);
    await expect(stage).toHaveScreenshot(`stage-${mode}.png`, { animations: "disabled" });
    // An odd-size portrait frame exercises fractional scale, rotation and all four clipping edges.
    await page.getByRole("button", { name: "Frame 2", exact: true }).click();
    await waitForStage(page);
    await expect(stage).toHaveScreenshot(`odd-portrait-${mode}.png`, { animations: "disabled" });
    await testInfo.attach("viewer-page", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
}
