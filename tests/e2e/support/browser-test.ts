import { test as base, expect, type Page } from "@playwright/test";

export const test = base.extend<{ browserErrors: void }>({
  // A page that renders its heading can still have hydration or uncaught interaction failures.
  browserErrors: [
    async ({ page }, use) => {
      // UI deployment scenarios provide their own job responses; never start a real exporter.
      await page.route("**/api/ops/public-deploy**", (route) =>
        route.fulfill({ status: 404, json: { error: "No E2E deployment job" } }),
      );
      const errors: string[] = [];
      page.on("pageerror", (error) => {
        // WebKit rejects the devtools source-map fetch when a tested reload closes its document.
        // Keep application errors; only this traced Next devtools teardown failure is excluded.
        if (
          error.stack?.includes("next-devtools") &&
          error.message.includes("__nextjs_original-stack-frames") &&
          error.message.includes("access control checks")
        )
          return;
        errors.push(error.message);
      });
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          /hydration|hydrating|did not match|React error/i.test(message.text())
        )
          errors.push(message.text());
      });
      await use();
      expect(errors, "Uncaught browser or hydration errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** Opens the responsive navigation only when its desktop rail is unavailable. */
export async function openNavigation(page: Page) {
  // A closing drawer still hides the page from accessibility queries until its exit completes.
  await expect(page.locator(".MuiDrawer-modal")).toHaveCount(0);
  const trigger = page
    .getByRole("button", { name: "打开导航", exact: true })
    .filter({ visible: true });
  if (await trigger.isVisible()) {
    await trigger.click();
    await expect(page.locator(".MuiDrawer-modal")).toBeVisible();
  }
}

/** Settings move into a drawer below the supporting-pane breakpoint. */
export async function openSettings(page: Page) {
  await expect(page.locator(".MuiDrawer-modal")).toHaveCount(0);
  // Next keeps earlier routes hidden in the DOM; target the current page's control.
  const trigger = page
    .getByRole("button", { name: "管理项目", exact: true })
    .filter({ visible: true });
  if (await trigger.isVisible()) {
    await trigger.click();
    await expect(page.locator(".MuiDrawer-modal")).toBeVisible();
  }
}

/** Dismisses transient notifications through their controls so full-page baselines show the form. */
export async function dismissNotifications(page: Page) {
  const close = page.getByRole("alert").getByRole("button", { name: /close|关闭/i });
  while (await close.count()) await close.first().click();
}

/** Makes overflow visible to tests without coupling assertions to the layout implementation. */
export async function expectPageFits(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
}

export function viewerPath(variant: unknown) {
  return variant === "internal" ? "/cases/e2e-sample/groups/viewer" : "/g/e2e-sample--viewer";
}

/** Wait for real image decode and visible pixels, not a placeholder with the same dimensions. */
export async function waitForStage(page: Page) {
  const images = page.locator("[data-viewer-stage-image]");
  await expect(images.first()).toBeVisible();
  await expect
    .poll(() =>
      images.evaluateAll(
        (nodes) =>
          nodes.length > 0 &&
          nodes.every((node) => {
            const image = node as HTMLImageElement;
            return image.complete && image.naturalWidth > 0;
          }),
      ),
    )
    .toBe(true);
  // A/B keeps both decoded layers in the stage and hides one side by opacity. Its default no longer
  // guarantees that DOM order matches the visible side, so wait for any decoded stage image.
  await expect
    .poll(() =>
      images.evaluateAll((nodes) =>
        nodes.some((node) => {
          const image = node as HTMLImageElement;
          return (
            image.complete && image.naturalWidth > 0 && Number(getComputedStyle(node).opacity) === 1
          );
        }),
      ),
    )
    .toBe(true);
}

/** Chromium protocol input lets the browser arbitrate scrolling, unlike dispatched DOM events. */
export async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  cancel = false,
) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
    for (let step = 1; step <= 12; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: from.x + ((to.x - from.x) * step) / 12, y: from.y + ((to.y - from.y) * step) / 12 },
        ],
      });
    }
    await session.send("Input.dispatchTouchEvent", {
      type: cancel ? "touchCancel" : "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

/** Wait for shell hydration's restoration request before capturing or leaving an SSR page. */
export async function openInternalPage(page: Page, url: string) {
  const restored = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/ops/public-deploy") && response.request().method() === "GET",
  );
  await page.goto(url);
  await (await restored).finished();
}
