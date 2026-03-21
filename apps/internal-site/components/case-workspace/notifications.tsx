import {
  CheckCircleOutline,
  Close,
  ErrorOutline,
  InfoOutlined,
  WarningAmber,
} from "@mui/icons-material";
import { Box, IconButton, Paper, Stack } from "@mui/material";
import { AnimatePresence, motion } from "motion/react";
import type { WorkspaceNotification } from "./use-workspace-notifications";

function WorkspaceNotificationCard({
  notification,
  index,
  onDismiss,
}: {
  notification: WorkspaceNotification;
  index: number;
  onDismiss: (id: string) => void;
}) {
  const icon =
    notification.tone === "success" ? (
      <CheckCircleOutline fontSize="small" />
    ) : notification.tone === "warning" ? (
      <WarningAmber fontSize="small" />
    ) : notification.tone === "error" ? (
      <ErrorOutline fontSize="small" />
    ) : (
      <InfoOutlined fontSize="small" />
    );

  return (
    <Paper
      component={motion.div}
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: index === 3 ? 0.8 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      elevation={0}
      sx={{
        minWidth: { xs: "min(92vw, 320px)", sm: 360 },
        borderRadius: 2.75,
        border: "1px solid",
        borderColor:
          notification.tone === "error"
            ? "error.main"
            : notification.tone === "warning"
              ? "warning.main"
              : notification.tone === "success"
                ? "primary.main"
                : "divider",
        backgroundColor:
          notification.tone === "error"
            ? "rgba(127, 29, 29, 0.92)"
            : notification.tone === "warning"
              ? "rgba(96, 61, 11, 0.92)"
              : notification.tone === "success"
                ? "rgba(31, 49, 92, 0.94)"
                : "rgba(17, 28, 61, 0.94)",
        boxShadow: "0 18px 42px rgba(0,0,0,0.28)",
      }}
    >
      <Stack direction="row" spacing={1.1} alignItems="flex-start" sx={{ px: 1.5, py: 1.2 }}>
        <Box sx={{ color: "text.primary", pt: 0.1 }}>{icon}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            component="p"
            sx={{
              m: 0,
              color: "text.primary",
              fontSize: "0.92rem",
              lineHeight: 1.5,
            }}
          >
            {notification.message}
          </Box>
        </Box>
        {!notification.sticky ? (
          <IconButton
            size="small"
            onClick={() => onDismiss(notification.id)}
            sx={{ width: 28, height: 28, mt: "-2px" }}
          >
            <Close sx={{ fontSize: 16 }} />
          </IconButton>
        ) : null}
      </Stack>
    </Paper>
  );
}

export function WorkspaceNotifications({
  notifications,
  onDismiss,
}: {
  notifications: WorkspaceNotification[];
  onDismiss: (id: string) => void;
}) {
  return (
    <Box
      sx={{
        position: "fixed",
        right: { xs: 12, md: 20 },
        bottom: { xs: 12, md: 20 },
        zIndex: 1600,
        pointerEvents: "none",
      }}
    >
      <Stack
        direction="column-reverse"
        spacing={1}
        sx={{
          alignItems: "flex-end",
          "& > *": {
            pointerEvents: "auto",
          },
        }}
      >
        <AnimatePresence initial={false}>
          {notifications.map((notification, index) => (
            <WorkspaceNotificationCard
              key={notification.id}
              notification={notification}
              index={index}
              onDismiss={onDismiss}
            />
          ))}
        </AnimatePresence>
      </Stack>
    </Box>
  );
}
