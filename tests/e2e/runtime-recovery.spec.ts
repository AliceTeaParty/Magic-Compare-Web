import { test, expect, viewerPath, waitForStage } from "./support/browser-test";

/** Updates are read from deployed metadata, not inferred from a previous localStorage visit. */
test("same-version build update is detected on focus and refresh preserves user preferences", async ({
  page,
}, info) => {
  const response = await page.request.get("/build.json");
  expect(response.ok()).toBe(true);
  const current = await response.json();
  expect(current.commitHash).toBeTruthy();
  let remote = current;
  await page.route("**/build.json?*", (route) => route.fulfill({ json: remote }));
  await page.clock.install();
  await page.addInitScript(() =>
    localStorage.setItem("magic_compare_viewer_guide_v1", "dismissed"),
  );
  await page.goto(viewerPath(info.project.metadata.variant));
  await waitForStage(page);
  await expect(page.getByRole("button", { name: "刷新版本", exact: true })).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem("runtime-audit-preference", "preserve-me"));
  remote = { ...current, commitHash: "next-commit-with-the-same-release" };
  await page.clock.fastForward(16_000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const refresh = page.getByRole("button", { name: "刷新版本", exact: true });
  await expect(refresh).toBeVisible();
  expect(page.url()).not.toContain("__mc_refresh");
  await refresh.click();
  await expect(page).toHaveURL(/__mc_refresh=/);
  await waitForStage(page);
  expect(await page.evaluate(() => localStorage.getItem("runtime-audit-preference"))).toBe(
    "preserve-me",
  );
  const url = page.url();
  // A stale document served after a manual refresh must never start an automatic reload loop.
  await page.clock.fastForward(61_000);
  expect(page.url()).toBe(url);
});

test("missing build metadata does not block image inspection", async ({ page }, info) => {
  await page.route("**/build.json?*", (route) => route.fulfill({ status: 404, body: "Not found" }));
  await page.addInitScript(() =>
    localStorage.setItem("magic_compare_viewer_guide_v1", "dismissed"),
  );
  await page.goto(viewerPath(info.project.metadata.variant));
  await waitForStage(page);
  await expect(page.getByRole("button", { name: "刷新版本", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Frame 2", exact: true }).click();
  await waitForStage(page);
});

test("same-frame source replacement isolates late decode and events without changing the selected column", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem("magic_compare_viewer_guide_v1", "dismissed");
    const original = HTMLImageElement.prototype.decode;
    const state = {
      old: null as HTMLImageElement | null,
      release: null as (() => void) | null,
      block: true,
      gate: null as Promise<void> | null,
    };
    (window as unknown as { imageAudit: typeof state }).imageAudit = state;
    HTMLImageElement.prototype.decode = async function () {
      await original.call(this);
      if (
        state.block &&
        this.hasAttribute("data-viewer-stage-image") &&
        this.src.includes("bbbbbb-0.svg")
      ) {
        if (!state.gate) {
          state.old = this;
          state.gate = new Promise<void>((resolve) => {
            state.release = resolve;
          });
        }
        await state.gate;
      }
    };
  });
  await page.goto(viewerPath(info.project.metadata.variant));
  await waitForStage(page);
  await page.getByRole("button", { name: "使用 Flt 作为对比变量", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((window as unknown as { imageAudit: { release: unknown } }).imageAudit.release),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "使用 Rip 作为对比变量", exact: true }).click();
  await waitForStage(page);
  expect(
    await page.evaluate(() => {
      const state = (
        window as unknown as {
          imageAudit: { old: HTMLImageElement; release: () => void; block: boolean };
        }
      ).imageAudit;
      const detached = !state.old.isConnected;
      // Deliberate late-event injection verifies handler isolation; real delayed fetch tests live in viewer.spec.
      state.old.dispatchEvent(new Event("error"));
      state.old.dispatchEvent(new Event("load"));
      state.block = false;
      state.release();
      return detached;
    }),
  ).toBe(true);
  await waitForStage(page);
  await expect(page.getByText(/加载失败，请刷新重试/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "使用 Rip 作为对比变量", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "使用 Flt 作为对比变量", exact: true }).click();
  await waitForStage(page);
});
