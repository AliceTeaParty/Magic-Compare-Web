import { expect, test, viewerPath, waitForStage, expectPageFits } from "./support/browser-test";

/** Real workers decode deterministic originals in every engine, including static public exports. */
test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("magic_compare_viewer_guide_v1", "dismissed"),
  );
  await page.goto(viewerPath(testInfo.project.metadata.variant));
  await waitForStage(page);
});

test("Heatmap analysis uses the same supporting-pane path without moving the stage down", async ({
  page,
  isMobile,
}) => {
  const stage = page.getByTestId("viewer-stage");
  // Opening the sidebar can scroll the document; compare stage position in document coordinates.
  const stageTop = () =>
    stage.evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
  const beforeTop = await stageTop();
  await page.getByRole("button", { name: "Heatmap", exact: true }).click();
  await page.getByRole("button", { name: "打开 Heatmap", exact: true }).click();
  const panel = page.getByRole("region", { name: "Heatmap" });
  await expect(panel).toBeVisible();
  const after = (await stage.boundingBox())!;
  await expect.poll(stageTop).toBeCloseTo(beforeTop, 0);

  if (isMobile) {
    await expect(page.locator(".MuiDrawer-paper").filter({ has: panel })).toBeVisible();
  } else {
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.x).toBeGreaterThan(after.x);
  }

  await panel.getByRole("button", { name: "关闭 Heatmap", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect.poll(stageTop).toBeCloseTo(beforeTop, 0);
});

test("Heatmap disables details and explains the shortcut", async ({ page }) => {
  await page.getByRole("button", { name: "Heatmap", exact: true }).click();
  const details = page.getByRole("button", { name: "打开详情", exact: true });
  await expect(details).toBeDisabled();
  await page.keyboard.press("i");
  await expect(page.getByText("Heatmap 模式暂时无法打开详情", { exact: true })).toBeVisible();
  await expect(details).toHaveAttribute("aria-pressed", "false");
});

test("Heatmap sensitivity menu and legend keep the shared alignment", async ({ page }) => {
  await page.getByRole("button", { name: "Heatmap", exact: true }).click();
  await page.getByRole("button", { name: "打开 Heatmap", exact: true }).click();
  const panel = page.getByRole("region", { name: "Heatmap" });
  const sensitivity = panel.getByRole("combobox", { name: "Heatmap 灵敏度" });
  await expect(sensitivity).toHaveCSS("justify-content", "center");

  const legend = panel.getByText("弱 → 强", { exact: true }).locator("..");
  await expect(legend).toHaveCSS("border-style", "solid");
  const bar = (await legend.locator("div").first().boundingBox())!;
  const label = (await legend.getByText("弱 → 强", { exact: true }).boundingBox())!;
  expect(Math.abs(bar.y + bar.height / 2 - label.y - label.height / 2)).toBeLessThan(3);

  await sensitivity.click();
  await expect(page.getByRole("option", { name: "自动", exact: true })).toHaveCSS(
    "justify-content",
    "center",
  );
});

test("live analysis follows Rip/Flt and survives leaving and re-entering heatmap", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Heatmap", exact: true }).click();
  await page.getByRole("button", { name: "打开 Heatmap", exact: true }).click();
  const panel = page.getByRole("region", { name: "Heatmap" });
  const heatmap = page.locator('[data-viewer-stage-image][alt="实时差异 Heatmap"]');
  await expect(heatmap).toHaveAttribute("src", /^blob:/);
  const rip = await heatmap.getAttribute("src");
  await waitForStage(page);
  await page.getByRole("button", { name: "使用 Flt 作为对比变量", exact: true }).click();
  await expect.poll(() => heatmap.getAttribute("src")).toMatch(/^blob:/);
  await expect.poll(() => heatmap.getAttribute("src")).not.toBe(rip);
  await panel.getByRole("button", { name: "原图", exact: true }).click();
  await expect(heatmap).toHaveCount(0);
  await expect(
    page.getByTestId("viewer-stage").locator('[data-viewer-stage-image][alt="Flt base"]'),
  ).toBeVisible();
  await waitForStage(page);
  await panel.getByRole("button", { name: "仅 Heatmap", exact: true }).click();
  await waitForStage(page);
  await expect(heatmap).toHaveCSS("opacity", "1");
  const decodedHeatmapUrl = await heatmap.getAttribute("src");
  await panel.getByRole("button", { name: "关闭 Heatmap", exact: true }).click();
  await expect(panel).toHaveCount(0);
  // A real reversed transition must reuse the decoded map rather than expose the original while
  // starting a second fetch/worker cycle. Two animation frames commit exit before re-entry.
  await page.evaluate(async () => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((button) => button.textContent?.trim() === "A / B")!.click();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    buttons.find((button) => button.textContent?.trim() === "Heatmap")!.click();
  });
  await expect(heatmap).toHaveAttribute("src", decodedHeatmapUrl!);
  await expect(heatmap).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "滑动", exact: true }).click();
  await expect(page.locator('[data-viewer-mode-layer="heatmap"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Heatmap", exact: true }).click();
  await page.getByRole("button", { name: "打开 Heatmap", exact: true }).click();
  await expect(heatmap).toHaveAttribute("src", /^blob:/);
  expect(await heatmap.getAttribute("src")).not.toBe(decodedHeatmapUrl);
  await waitForStage(page);
  await expectPageFits(page);
});

test("subtle localized differences expose stable scores, sensitivity and original-image inspection", async ({
  page,
}) => {
  // Alter only the pixels fetched for analysis; source dimensions and the real worker stay intact.
  // Heatmap adds an origin-specific query so a prior non-CORS CDN response cannot be reused.
  await page.route("**/internal-assets/e2e/*.svg*", (route) => {
    if (route.request().resourceType() !== "fetch") return route.continue();
    const before = route.request().url().includes("ffffff");
    return route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#202020"/><rect x="160" y="128" width="64" height="64" fill="${before ? "#202020" : "#242424"}"/></svg>`,
    });
  });
  await page.getByRole("button", { name: "Heatmap", exact: true }).click();
  await page.getByRole("button", { name: "打开 Heatmap", exact: true }).click();
  const panel = page.getByRole("region", { name: "Heatmap" });
  const hotspot = panel.getByRole("button", { name: "检查区域 1", exact: true });
  await expect(hotspot).toBeVisible();
  const score = (await hotspot.innerText()).replace(/\s+/g, " ").trim();
  const heatmap = page.locator('[data-viewer-stage-image][alt="实时差异 Heatmap"]');
  const initialHeatmapUrl = await heatmap.getAttribute("src");
  await panel.getByRole("combobox", { name: "Heatmap 灵敏度" }).click();
  await page.getByRole("option", { name: "增强 2×", exact: true }).click();
  await expect.poll(() => heatmap.getAttribute("src")).not.toBe(initialHeatmapUrl);
  await expect
    .poll(async () => (await hotspot.innerText()).replace(/\s+/g, " ").trim())
    .toBe(score);
  await panel.getByRole("button", { name: "叠加", exact: true }).click();
  await expect(panel.getByRole("slider", { name: "Heatmap 透明度" })).toBeVisible();
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
  await page.route("**/internal-assets/e2e/*.svg*", (route) =>
    route.request().resourceType() === "fetch" ? route.abort() : route.continue(),
  );
  await page.getByRole("button", { name: "Heatmap", exact: true }).click();
  await page.getByRole("button", { name: "打开 Heatmap", exact: true }).click();
  const panel = page.getByRole("region", { name: "Heatmap" });
  const heatmap = page.locator('[data-viewer-stage-image][alt="实时差异 Heatmap"]');
  await expect(panel.getByRole("button", { name: "重试分析", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "使用预生成 Heatmap", exact: true }).click();
  await expect(panel.getByText(/预生成 Heatmap（Deprecated）/)).toBeVisible();
  await expect(
    page.getByTestId("viewer-stage").locator('[data-viewer-stage-image][alt="Heatmap"]'),
  ).toBeVisible();
  await waitForStage(page);
  await page.getByRole("button", { name: "使用 Flt 作为对比变量", exact: true }).click();
  await expect(panel.getByRole("button", { name: "重试分析", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "使用预生成 Heatmap", exact: true })).toHaveCount(
    0,
  );
  await page.unroute("**/internal-assets/e2e/*.svg*");
  await panel.getByRole("button", { name: "重试分析", exact: true }).click();
  await expect(heatmap).toHaveAttribute("src", /^blob:/);
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
  await page.route("**/internal-assets/e2e/*-0.svg*", async (route) => {
    if (route.request().resourceType() === "fetch") {
      requested();
      await gate;
    }
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Heatmap", exact: true }).click();
    await started;
    await page.getByRole("button", { name: "Frame 3", exact: true }).click();
    release();
    await waitForStage(page);
    const image = page.locator('[data-viewer-stage-image][alt="实时差异 Heatmap"]');
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
