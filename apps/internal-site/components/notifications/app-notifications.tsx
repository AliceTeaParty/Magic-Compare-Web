import { Alert, Stack } from "@mui/material";
import type { AppNotification } from "./use-app-notifications";

/** Renders mutation feedback above page content so progress never shifts the workspace list. */
export function AppNotifications({
  notifications,
  onDismiss,
}: {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
}) {
  if (notifications.length === 0) return null;

  return (
    <Stack
      spacing={1}
      sx={{
        position: "fixed",
        zIndex: "snackbar",
        right: { xs: 16, sm: 24 },
        bottom: { xs: 16, sm: 24 },
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
  );
}
