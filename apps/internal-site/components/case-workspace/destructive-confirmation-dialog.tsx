"use client";

import { DeleteOutlined } from "@mui/icons-material";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { useRootScrollLock } from "@magic-compare/ui";

/** Keeps Case and Group deletion on the same explicit M3 hierarchy and pending behavior. */
export function DestructiveConfirmationDialog({
  description,
  loading,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  description: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  useRootScrollLock(open);

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!loading) onCancel();
      }}
      // The shared root lock prevents nested deletion dialogs from adding another body offset.
      disableScrollLock
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 3,
          pt: 3,
          pb: 1.25,
          fontSize: "1.25rem",
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        <DeleteOutlined color="error" sx={{ fontSize: 24 }} />
        {title}
      </DialogTitle>
      <DialogContent sx={{ px: 3, pb: 1.5 }}>
        {/* The consequence reads as supporting copy; it must not visually compete with the action. */}
        <DialogContentText
          sx={{
            color: "text.secondary",
            fontSize: "0.875rem",
            fontWeight: 450,
            lineHeight: 1.6,
          }}
        >
          {description}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pt: 1, pb: 2.5 }}>
        <Button onClick={onCancel} disabled={loading}>
          取消
        </Button>
        <Button color="error" variant="contained" loading={loading} onClick={onConfirm}>
          删除
        </Button>
      </DialogActions>
    </Dialog>
  );
}
