import { useCallback, useRef, useState } from "react";

export type WorkspaceNotificationTone = "error" | "info" | "success" | "warning";

export interface WorkspaceNotification {
  id: string;
  message: string;
  tone: WorkspaceNotificationTone;
  sticky?: boolean;
}

/**
 * Centralizes workspace toast lifecycle so concurrent actions can replace or pin notifications
 * without each component needing its own timer bookkeeping.
 */
export function useWorkspaceNotifications() {
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const timeoutIdsRef = useRef(new Map<string, number>());

  /**
   * Clears both the visible toast and any pending timeout so reused notification keys do not leave
   * stale timers around that could dismiss a newer message unexpectedly.
   */
  const dismissNotification = useCallback((notificationId: string) => {
    const timeoutId = timeoutIdsRef.current.get(notificationId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutIdsRef.current.delete(notificationId);
    }

    setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
  }, []);

  /**
   * Reuses stable keys when provided so long-running workspace actions can update one toast instead
   * of creating a new stack entry on every progress event.
   */
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

        // Cap the stack to four items so fixed-position toasts do not cover the entire workspace on
        // smaller screens.
        return next.slice(0, 4);
      });

      if (options?.sticky) {
        return;
      }

      // A little over four seconds keeps non-sticky toasts readable without forcing manual dismisses.
      const timeoutId = window.setTimeout(() => {
        dismissNotification(notificationId);
      }, 4200);

      timeoutIdsRef.current.set(notificationId, timeoutId);
    },
    [dismissNotification],
  );

  /**
   * Uses a dedicated sticky notification so multiple save operations can share one visible
   * "workspace is busy" indicator.
   */
  const showWorkspaceSavingNotification = useCallback(() => {
    pushNotification("Saving workspace updates...", "info", {
      key: "workspace-saving",
      sticky: true,
    });
  }, [pushNotification]);

  /**
   * Clears the shared save indicator once the mutation that owns it finishes.
   */
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
