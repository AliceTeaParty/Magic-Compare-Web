import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyBrowserDeploySuccess } from "./browser-deploy-notifications";

function installNotificationApi(
  permission: NotificationPermission,
  visibilityState: DocumentVisibilityState = "hidden",
) {
  const requestPermission = vi.fn(async () => permission);
  const showNotification = vi.fn();

  class FakeNotification {
    static permission = permission;
    static requestPermission = requestPermission;

    constructor(title: string, options?: NotificationOptions) {
      showNotification(title, options);
    }
  }

  vi.stubGlobal("window", { Notification: FakeNotification });
  vi.stubGlobal("document", { visibilityState });
  return { requestPermission, showNotification };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser deploy notifications", () => {
  it("shows a completion notification when the workspace is in the background", () => {
    const { showNotification } = installNotificationApi("granted", "hidden");

    notifyBrowserDeploySuccess("magic-compare-public");

    expect(showNotification).toHaveBeenCalledWith("Magic Compare 部署完成", {
      body: "Cloudflare Pages 项目 magic-compare-public 已更新。",
      tag: "magic-compare-public-deploy",
    });
  });

  it("uses the in-app success message while the workspace remains visible", () => {
    const { showNotification } = installNotificationApi("granted", "visible");

    notifyBrowserDeploySuccess("magic-compare-public");

    expect(showNotification).not.toHaveBeenCalled();
  });
});
