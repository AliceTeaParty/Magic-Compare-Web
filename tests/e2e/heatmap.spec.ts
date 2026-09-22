import { expect, test, viewerPath, waitForStage, expectPageFits } from "./support/browser-test";

/** Real workers decode deterministic originals in every engine, including static public exports. */
test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("magic_compare_viewer_guide_v1", "dismissed"),
  );
  await page.goto(viewerPath(testInfo.project.metadata.variant));
  await waitForStage(page);
});

test("live analysis follows Rip/Flt and survives leaving and re-entering heatmap", async ({
  page,
}) => {
  await page.getByRole("button", { name: "热图", exact: true }).click();
  const panel = page.getByRole("region", { name: "热图分析" });
  await expect(panel.getByText(/全图差异 RMS/)).toBeVisible();
  const rip = await panel.getByText(/全图差异 RMS/).innerText();
  const heatmap = page.getByRole("img", { name: "实时差异热图", exact: true });
  await expect(heatmap).toHaveAttribute("src", /^blob:/);
  await waitForStage(page);
  await page.getByRole("button", { name: "使用 Flt 作为对比变量", exact: true }).click();
  await expect(panel.getByText(/全图差异 RMS/)).toBeVisible();
  await expect(panel.getByText(/全图差异 RMS/)).not.toHaveText(rip);
  const flt = await panel.getByText(/全图差异 RMS/).innerText();
  await panel.getByRole("button", { name: "原图", exact: true }).click();
  await expect(heatmap).toHaveCount(0);
  await expect(
    page.getByTestId("viewer-stage").getByRole("img", { name: "Flt base", exact: true }),
  ).toBeVisible();
  await waitForStage(page);
  await panel.getByRole("button", { name: "仅热图", exact: true }).click();
  await waitForStage(page);
  await expect(heatmap).toHaveCSS("opacity", "1");
  const decodedHeatmapUrl = await heatmap.getAttribute("src");
  // A real reversed transition must reuse the decoded map rather than expose the original while
  // starting a second fetch/worker cycle. Two animation frames commit exit before re-entry.
  await page.evaluate(async () => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((button) => button.textContent?.trim() === "A / B")!.click();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    buttons.find((button) => button.textContent?.trim() === "热图")!.click();
  });
  await expect(heatmap).toHaveAttribute("src", decodedHeatmapUrl!);
  await expect(heatmap).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "滑动", exact: true }).click();
  await expect(page.locator('[data-viewer-mode-layer="heatmap"]')).toHaveCount(0);
  await page.getByRole("button", { name: "热图", exact: true }).click();
  await expect(panel.getByText(/全图差异 RMS/)).toHaveText(flt);
  await expect(heatmap).toHaveAttribute("src", /^blob:/);
  expect(await heatmap.getAttribute("src")).not.toBe(decodedHeatmapUrl);
  await waitForStage(page);
  await expectPageFits(page);
});

test("subtle localized differences expose stable scores, sensitivity and original-image inspection", async ({
  page,
}) => {
  // Alter only the pixels fetched for analysis; source dimensions and the real worker stay intact.
  await page.route("**/internal-assets/e2e/*.svg", (route) => {
    if (route.request().resourceType() !== "fetch") return route.continue();
    const before = route.request().url().includes("ffffff");
    return route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#202020"/><rect x="160" y="128" width="64" height="64" fill="${before ? "#202020" : "#242424"}"/></svg>`,
    });
  });
  await page.getByRole("button", { name: "热图", exact: true }).click();
  const panel = page.getByRole("region", { name: "热图分析" });
  const hotspot = panel.getByRole("button", { name: "检查区域 1", exact: true });
  await expect(hotspot).toBeVisible();
  const score = await hotspot.innerText();
  const rms = await panel.getByText(/全图差异 RMS/).innerText();
  await panel.getByRole("combobox", { name: "灵敏度" }).click();
  await page.getByRole("option", { name: "增强 2×", exact: true }).click();
  await expect(panel.getByText(/色阶上限 3.0/)).toBeVisible();
  await expect(hotspot).toHaveText(score);
  await expect(panel.getByText(/全图差异 RMS/)).toHaveText(rms);
  await panel.getByRole("button", { name: "叠加", exact: true }).click();
  await expect(panel.getByRole("slider", { name: "热图透明度" })).toBeVisible();
  await expectPageFits(page);
  await hotspot.click();
  await expect(page.getByRole("button", { name: "A / B", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: /A\/B inspect stage.*Showing Rip/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("300%", { exact: true })).toBeVisible();
});

test("failed analysis offers a matching stored map and retry recovers", async ({ page }) => {
  await page.route("**/internal-assets/e2e/*.svg", (route) =>
    route.request().resourceType() === "fetch" ? route.abort() : route.continue(),
  );
  await page.getByRole("button", { name: "热图", exact: true }).click();
  const panel = page.getByRole("region", { name: "热图分析" });
  await expect(panel.getByRole("button", { name: "重试分析", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "使用预生成热图", exact: true }).click();
  await expect(panel.getByText(/预生成热图 · 使用上传时的算法/)).toBeVisible();
  await expect(
    page.getByTestId("viewer-stage").getByRole("img", { name: "Heatmap", exact: true }),
  ).toBeVisible();
  await waitForStage(page);
  await page.getByRole("button", { name: "使用 Flt 作为对比变量", exact: true }).click();
  await expect(panel.getByRole("button", { name: "重试分析", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "使用预生成热图", exact: true })).toHaveCount(0);
  await page.unroute("**/internal-assets/e2e/*.svg");
  await panel.getByRole("button", { name: "重试分析", exact: true }).click();
  await expect(panel.getByText(/全图差异 RMS/)).toBeVisible();
  await waitForStage(page);
});

test("a late original response cannot replace analysis of the newly selected frame", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route("**/internal-assets/e2e/*-0.svg", async (route) => {
    if (route.request().resourceType() === "fetch") {
      requested();
      await gate;
    }
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "热图", exact: true }).click();
    await started;
    await page.getByRole("button", { name: "Frame 3", exact: true }).click();
    const panel = page.getByRole("region", { name: "热图分析" });
    await expect(panel.getByText(/全图差异 RMS/)).toBeVisible();
    release();
    await waitForStage(page);
    const image = page.getByRole("img", { name: "实时差异热图", exact: true });
    await expect
      .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBe(513);
    await expect(page.getByRole("button", { name: "Frame 3", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  } finally {
    release();
  }
});
