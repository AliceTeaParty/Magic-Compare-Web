import type { Page } from "@playwright/test";
import { expect, test, touchDrag, viewerPath, waitForStage } from "./support/browser-test";

/** Compare actual boxes; matching a CSS declaration misses competing layout selectors. */
async function centerError(page: Page) {
  const area = await page.getByTestId("viewer-stage-area").boundingBox();
  const stage = await page.getByTestId("viewer-stage").boundingBox();
  if (!area || !stage) return Infinity;
  return Math.abs(stage.x + stage.width / 2 - area.x - area.width / 2);
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("magic_compare_viewer_guide_v1", "dismissed"),
  );
  await page.goto(viewerPath(testInfo.project.metadata.variant));
  await waitForStage(page);
});

test("stage is centered for landscape, portrait and square frames and after resize", async ({
  page,
}) => {
  for (const frame of [1, 2, 3]) {
    await page.getByRole("button", { name: `Frame ${frame}`, exact: true }).click();
    await waitForStage(page);
    await expect.poll(() => centerError(page)).toBeLessThanOrEqual(1);
  }
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => centerError(page)).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test("details and guide preserve stage geometry and close without trapping the page", async ({
  page,
  isMobile,
}) => {
  await page.getByRole("button", { name: "打开详情", exact: true }).click();
  if (isMobile) {
    await page.keyboard.press("Escape");
  } else {
    await expect.poll(() => centerError(page)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  }
  await expect.poll(() => centerError(page)).toBeLessThanOrEqual(1);
  const before = await page.getByTestId("viewer-stage").boundingBox();
  await page.getByRole("button", { name: "查看引导", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "查看引导", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect.poll(() => centerError(page)).toBeLessThanOrEqual(1);
  expect((await page.getByTestId("viewer-stage").boundingBox())?.width).toBeCloseTo(
    before!.width,
    0,
  );
});

test("swipe moves in the visible direction and reset restores its midpoint", async ({
  page,
  isMobile,
}) => {
  const stage = page.getByTestId("viewer-stage");
  await stage.scrollIntoViewIfNeeded();
  const box = (await stage.boundingBox())!;
  const surface = stage.locator('[style*="--swipe-position"]');
  const x = box.x + box.width * (isMobile ? 0.5 : 0.75);
  const y = box.y + box.height * (isMobile ? 0.75 : 0.5);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() =>
      surface.evaluate((node) =>
        parseFloat((node as HTMLElement).style.getPropertyValue("--swipe-position")),
      ),
    )
    .toBeCloseTo(75, 0);
  await page.keyboard.press("r");
  await expect
    .poll(() =>
      surface.evaluate((node) =>
        parseFloat((node as HTMLElement).style.getPropertyValue("--swipe-position")),
      ),
    )
    .toBe(50);
});

test("A/B cycles Src, Rip and Flt; zoom and reset keep the selected original", async ({ page }) => {
  await page.getByRole("button", { name: "A / B", exact: true }).click();
  const stage = page.getByRole("button", { name: /A\/B inspect stage/ });
  await stage.click();
  await expect(stage).toHaveAttribute("aria-pressed", "true");
  const seen = new Set<string>();
  for (let index = 0; index < 4; index++) {
    const label = await stage.getAttribute("aria-label");
    seen.add(label?.match(/Showing (\w+)/)?.[1] ?? "");
    await stage.press("Enter");
  }
  expect([...seen].sort()).toEqual(["Flt", "Rip", "Src"]);
  await page.getByRole("button", { name: "放大 A/B 视图", exact: true }).click();
  await page.keyboard.press("r");
  await expect(stage).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "滑动", exact: true }).click();
  await waitForStage(page);
});

test("heatmap changes opacity and mode survives reload", async ({ page }) => {
  await page.getByRole("button", { name: "热图", exact: true }).click();
  const opacity = page.getByRole("slider", { name: "热图透明度" });
  await expect(opacity).toBeVisible();
  const initial = await opacity.getAttribute("aria-valuenow");
  await opacity.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(opacity).not.toHaveAttribute("aria-valuenow", initial!);
  await page.reload();
  await expect(page.getByRole("button", { name: "热图", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("slider", { name: "热图透明度" })).toBeVisible();
});

test("long filmstrip supports keyboard scrolling, end selection and returning home", async ({
  page,
}) => {
  const scrollbar = page.getByRole("scrollbar", { name: "Frame strip horizontal scroll" });
  await scrollbar.focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: "Frame 24", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Frame 24", exact: true }).click();
  await expect(page.getByRole("button", { name: "Frame 24", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await scrollbar.focus();
  await page.keyboard.press("Home");
  await expect(page.getByRole("button", { name: "Frame 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Frame 1", exact: true }).click();
  await waitForStage(page);
});

test("mouse dragging thumbnails scrolls without selecting; a subsequent click selects", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Mouse drag is covered on desktop projects.");
  const strip = page.locator("#viewer-filmstrip-scrollport");
  await strip.scrollIntoViewIfNeeded();
  const box = (await page.getByRole("button", { name: "Frame 2", exact: true }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 150, box.y + 25, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => strip.evaluate((node) => node.scrollLeft)).toBeGreaterThan(80);
  await page.getByRole("scrollbar").focus();
  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "Frame 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Frame 2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("native touch tap selects a frame on mobile engines", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch tap is covered on mobile projects.");
  const frame = page.getByRole("button", { name: "Frame 2", exact: true });
  await frame.tap();
  await expect(frame).toHaveAttribute("aria-pressed", "true");
  await waitForStage(page);
});

for (const origin of ["thumbnail", "title", "gap"]) {
  test(`trusted touch scroll starts on ${origin} without selecting`, async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(
      browserName !== "chromium" || !isMobile,
      "Continuous trusted touch uses Chromium CDP; no synthetic WebKit gesture claim.",
    );
    const strip = page.locator("#viewer-filmstrip-scrollport");
    await strip.scrollIntoViewIfNeeded();
    const box = (await page.getByRole("button", { name: "Frame 2", exact: true }).boundingBox())!;
    const from = {
      x: origin === "gap" ? box.x - 4 : box.x + box.width / 2,
      y: box.y + (origin === "title" ? box.height - 12 : 25),
    };
    await touchDrag(page, from, { x: from.x - 130, y: from.y });
    await expect.poll(() => strip.evaluate((node) => node.scrollLeft)).toBeGreaterThan(50);
    await expect(page.locator('[data-frame-id][aria-pressed="true"]')).toHaveAttribute(
      "data-frame-id",
      "e2e-frame-0",
    );
  });
}

test("vertical touch scroll and cancellation do not select a thumbnail or trap later taps", async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(
    browserName !== "chromium" || !isMobile,
    "Trusted browser gesture arbitration requires CDP.",
  );
  const strip = page.locator("#viewer-filmstrip-scrollport");
  await strip.scrollIntoViewIfNeeded();
  const box = (await strip.boundingBox())!;
  const before = await page.evaluate(() => scrollY);
  await touchDrag(page, { x: box.x + 60, y: box.y + 20 }, { x: box.x + 60, y: box.y + 140 });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(before - 30);
  await strip.scrollIntoViewIfNeeded();
  const next = (await strip.boundingBox())!;
  await touchDrag(
    page,
    { x: next.x + 250, y: next.y + 25 },
    { x: next.x + 120, y: next.y + 25 },
    true,
  );
  await expect(page.locator('[data-frame-id][aria-pressed="true"]')).toHaveAttribute(
    "data-frame-id",
    "e2e-frame-0",
  );
  await page.getByRole("button", { name: "Frame 3", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Frame 3", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("failed image is honest and the next frame recovers", async ({ page }) => {
  await page.route("**/internal-assets/e2e/*-1.svg", (route) => route.abort());
  // Reload after installing the route: adjacent originals may already be in the decode cache.
  await page.reload();
  await waitForStage(page);
  await page.getByRole("button", { name: "Frame 2", exact: true }).click();
  await expect(page.getByText("Src 加载失败，请刷新重试。", { exact: true })).toBeVisible();
  await expect(page.getByText("Rip 加载失败，请刷新重试。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Frame 3", exact: true }).click();
  await waitForStage(page);
  await expect(page.getByText(/加载失败，请刷新重试/)).toHaveCount(0);
});

test("late image response cannot replace a newer frame selection", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/internal-assets/e2e/*-23.svg", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    const scrollbar = page.getByRole("scrollbar", { name: "Frame strip horizontal scroll" });
    await scrollbar.press("End");
    await page.getByRole("button", { name: "Frame 24", exact: true }).click();
    const image = page.locator("[data-viewer-stage-image]").first();
    await expect(image).toHaveAttribute("src", /-23\.svg$/);
    await expect(image).toHaveCSS("opacity", "0");
    await scrollbar.press("Home");
    await page.getByRole("button", { name: "Frame 1", exact: true }).click();
    release();
    await waitForStage(page);
    await expect(image).toHaveAttribute("src", /-0\.svg$/);
    await expect(page.getByRole("button", { name: "Frame 1", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  } finally {
    release();
  }
});

test("fitted originals cover fractional stage bounds without exposed strips", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const frame of [1, 2, 3]) {
    await page.getByRole("button", { name: `Frame ${frame}`, exact: true }).click();
    await waitForStage(page);
    await expect
      .poll(async () => {
        const stage = (await page.getByTestId("viewer-stage").boundingBox())!;
        const image = (await page.locator("[data-viewer-stage-image]").first().boundingBox())!;
        return Math.max(
          Math.abs(stage.x - image.x),
          Math.abs(stage.y - image.y),
          Math.abs(stage.width - image.width),
          Math.abs(stage.height - image.height),
        );
      })
      // WebKit quantizes transformed rectangles (up to 1/16px in this fixture); allow 1/8px,
      // still below the 0.151px exposed strip reproduced with integer clientWidth measurements.
      .toBeLessThanOrEqual(0.125);
  }
});
