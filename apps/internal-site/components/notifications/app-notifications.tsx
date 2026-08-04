import { Alert, Snackbar, Stack } from "@mui/material";
import type { AppNotification } from "./use-app-notifications";

/** Keeps persistent guidance in document flow and limits transient feedback to one snackbar. */
export function AppNotifications({
  notifications,
  onDismiss,
}: {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
}) {
  const stickyNotifications = notifications.filter((notification) => notification.sticky);
  const transientNotification = notifications.find((notification) => !notification.sticky) ?? null;

  return (
    <>
      {stickyNotifications.length > 0 ? (
        <Stack spacing={1}>
          {stickyNotifications.map((notification) => (
            <Alert key={notification.id} severity={notification.tone} variant="standard">
              {notification.message}
            </Alert>
          ))}
        </Stack>
      ) : null}
      <Snackbar
        open={Boolean(transientNotification)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        onClose={(_event, reason) => {
          // Escape should dismiss the active Material notification; clickaway stays ignored so an
          // unrelated workspace click cannot erase feedback before the operator reads it.
          if (reason !== "clickaway" && transientNotification) {
            onDismiss(transientNotification.id);
          }
        }}
      >
        {transientNotification ? (
          <Alert
            severity={transientNotification.tone}
            variant="filled"
            onClose={() => onDismiss(transientNotification.id)}
            sx={{ width: "min(92vw, 440px)" }}
          >
            {transientNotification.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
