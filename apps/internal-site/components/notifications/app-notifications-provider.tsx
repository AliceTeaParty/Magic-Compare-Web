"use client";

import type { ReactNode } from "react";
import { AppNotifications } from "./app-notifications";
import { AppNotificationsContext, useAppNotificationQueue } from "./use-app-notifications";

/**
 * Owns one notification queue above route transitions so deployment, workspace, creation, and
 * upload feedback share the same viewport anchor and replacement behavior.
 */
export function AppNotificationsProvider({ children }: { children: ReactNode }) {
  const notifications = useAppNotificationQueue();

  return (
    <AppNotificationsContext.Provider value={notifications}>
      {children}
      <AppNotifications
        notifications={notifications.notifications}
        onDismiss={notifications.dismissNotification}
      />
    </AppNotificationsContext.Provider>
  );
}
