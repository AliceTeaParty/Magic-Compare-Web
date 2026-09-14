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
    await expect(shell).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(238, 238, 238)" : "rgb(32, 32, 32)",
    );
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
