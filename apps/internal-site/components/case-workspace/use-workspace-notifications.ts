import { useCallback, useRef, useState } from "react";

export type WorkspaceNotificationTone = "error" | "info" | "success" | "warning";

export interface WorkspaceNotification {
  id: string;
  message: string;
  tone: WorkspaceNotificationTone;
  sticky?: boolean;
}

export function useWorkspaceNotifications() {
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const timeoutIdsRef = useRef(new Map<string, number>());

  const dismissNotification = useCallback((notificationId: string) => {
    const timeoutId = timeoutIdsRef.current.get(notificationId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutIdsRef.current.delete(notificationId);
    }

    setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
  }, []);

  const pushNotification = useCallback(
    (
      message: string,
      tone: WorkspaceNotificationTone,
      options?: { key?: string; sticky?: boolean },
    ) => {
      const notificationId = options?.key ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      setNotifications((current) => {
        const next = [
          {
            id: notificationId,
            message,
            tone,
            sticky: options?.sticky,
          },
          ...current.filter((notification) => notification.id !== notificationId),
        ];

        return next.slice(0, 4);
      });

      if (options?.sticky) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        dismissNotification(notificationId);
      }, 4200);

      timeoutIdsRef.current.set(notificationId, timeoutId);
    },
    [dismissNotification],
  );

  const showWorkspaceSavingNotification = useCallback(() => {
    pushNotification("Saving workspace updates...", "info", {
      key: "workspace-saving",
      sticky: true,
    });
  }, [pushNotification]);

  const dismissWorkspaceSavingNotification = useCallback(() => {
    dismissNotification("workspace-saving");
  }, [dismissNotification]);

  return {
    notifications,
    dismissNotification,
    pushNotification,
    showWorkspaceSavingNotification,
    dismissWorkspaceSavingNotification,
  };
}
