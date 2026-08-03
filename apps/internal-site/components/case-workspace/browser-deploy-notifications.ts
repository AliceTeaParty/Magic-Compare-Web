function browserNotificationApi() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return null;
  }

  return window.Notification;
}

/** Requests permission during the deploy click while browser user activation is still available. */
export function requestBrowserDeployNotificationPermission() {
  const NotificationApi = browserNotificationApi();
  if (!NotificationApi || NotificationApi.permission !== "default") {
    return;
  }

  // Notification support must stay optional; a rejected browser prompt cannot affect deployment.
  void NotificationApi.requestPermission().catch(() => undefined);
}

/** Shows a system notification only when the operator has left the active workspace tab. */
export function notifyBrowserDeploySuccess(projectName: string) {
  const NotificationApi = browserNotificationApi();
  if (
    !NotificationApi ||
    NotificationApi.permission !== "granted" ||
    (typeof document !== "undefined" && document.visibilityState === "visible")
  ) {
    return;
  }

  // The in-app success message covers the foreground case; this is a background-only convenience.
  try {
    new NotificationApi("Magic Compare 部署完成", {
      body: `Cloudflare Pages 项目 ${projectName} 已更新。`,
      tag: "magic-compare-public-deploy",
    });
  } catch {
    // Some browsers expose the API but reject direct construction; deployment has already succeeded.
  }
}
