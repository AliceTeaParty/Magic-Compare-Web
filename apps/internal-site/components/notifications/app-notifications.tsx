import { Alert, Portal, Stack } from "@mui/material";
import type { AppNotification } from "./use-app-notifications";

/** Renders the shell-owned mutation feedback at one viewport anchor above every route. */
export function AppNotifications({
  notifications,
  onDismiss,
}: {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
}) {
  if (notifications.length === 0) return null;

  return (
    <Portal>
      <Stack
        spacing={1}
        sx={{
          // Portal plus fixed positioning prevents route-transition transforms from turning this
          // viewport feedback layer into a page-local notification container.
          position: "fixed",
          zIndex: "snackbar",
          right: { xs: 16, sm: 24 },
          bottom: {
            xs: "max(16px, env(safe-area-inset-bottom))",
            sm: "max(24px, env(safe-area-inset-bottom))",
          },
          width: "min(calc(100vw - 32px), 440px)",
          pointerEvents: "none",
        }}
      >
        {notifications.map((notification) => (
          <Alert
            key={notification.id}
            severity={notification.tone}
            variant="filled"
            onClose={notification.sticky ? undefined : () => onDismiss(notification.id)}
            sx={{ pointerEvents: "auto", boxShadow: 3 }}
          >
            {notification.message}
          </Alert>
        ))}
      </Stack>
    </Portal>
  );
}
