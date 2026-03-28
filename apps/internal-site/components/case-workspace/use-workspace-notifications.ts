import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

export type WorkspaceNotificationTone =
  | "error"
  | "info"
  | "success"
  | "warning";

export interface WorkspaceNotification {
  id: string;
  message: string;
  tone: WorkspaceNotificationTone;
  sticky?: boolean;
}

const MAX_VISIBLE_NOTIFICATIONS = 4;
const NOTIFICATION_TIMEOUT_MS = 4200;

/**
 * Stable keys intentionally replace older notifications in place so long-running mutations can
 * update one visible toast instead of flooding the fixed stack with progress variants.
 */
function upsertNotification(
  current: WorkspaceNotification[],
  nextNotification: WorkspaceNotification,
) {
  return [
    nextNotification,
    ...current.filter((notification) => notification.id !== nextNotification.id),
  ].slice(0, MAX_VISIBLE_NOTIFICATIONS);
}

/**
 * Centralizes timer cleanup because reused notification ids would otherwise leave stale dismissal
 * timeouts behind that can remove a newer toast with the same key.
 */
function clearNotificationTimeout(
  timeoutIds: Map<string, number>,
  notificationId: string,
) {
  const timeoutId = timeoutIds.get(notificationId);
  if (timeoutId) {
    window.clearTimeout(timeoutId);
    timeoutIds.delete(notificationId);
  }
}

/**
 * Timer-backed dismissal stays in one callback so both manual close and auto-close clear the same
 * timeout registry before mutating visible state.
 */
function useDismissNotification(
  setNotifications: Dispatch<SetStateAction<WorkspaceNotification[]>>,
  timeoutIdsRef: MutableRefObject<Map<string, number>>,
) {
  return useCallback((notificationId: string) => {
    clearNotificationTimeout(timeoutIdsRef.current, notificationId);

    setNotifications((current) =>
      current.filter((notification) => notification.id !== notificationId),
    );
  }, [setNotifications, timeoutIdsRef]);
}

/**
 * Non-sticky notifications share one timeout registry so callers can focus on message intent
 * instead of reimplementing replacement, capping, and dismissal plumbing.
 */
function usePushNotification(
  dismissNotification: (notificationId: string) => void,
  setNotifications: Dispatch<SetStateAction<WorkspaceNotification[]>>,
  timeoutIdsRef: MutableRefObject<Map<string, number>>,
) {
  return useCallback(
    (
      message: string,
      tone: WorkspaceNotificationTone,
      options?: { key?: string; sticky?: boolean },
    ) => {
      const notificationId =
        options?.key ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      clearNotificationTimeout(timeoutIdsRef.current, notificationId);

      setNotifications((current) =>
        upsertNotification(current, {
          id: notificationId,
          message,
          tone,
          sticky: options?.sticky,
        }),
      );

      if (options?.sticky) {
        return;
      }

      // Slightly over four seconds keeps non-sticky toasts readable without forcing manual dismisses.
      const timeoutId = window.setTimeout(() => {
        dismissNotification(notificationId);
      }, NOTIFICATION_TIMEOUT_MS);

      timeoutIdsRef.current.set(notificationId, timeoutId);
    },
    [dismissNotification, setNotifications, timeoutIdsRef],
  );
}

/**
 * The queue hook only wires shared notification state together; timer behavior and stack updates
 * live in smaller helpers so the exported workspace hook stays readable.
 */
function useNotificationQueue() {
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>(
    [],
  );
  const timeoutIdsRef = useRef(new Map<string, number>());
  const dismissNotification = useDismissNotification(
    setNotifications,
    timeoutIdsRef,
  );
  const pushNotification = usePushNotification(
    dismissNotification,
    setNotifications,
    timeoutIdsRef,
  );

  return {
    notifications,
    dismissNotification,
    pushNotification,
  };
}

/**
 * Centralizes workspace toast lifecycle so concurrent actions can replace or pin notifications
 * without each component needing its own timer bookkeeping.
 */
export function useWorkspaceNotifications() {
  const { notifications, dismissNotification, pushNotification } =
    useNotificationQueue();

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
