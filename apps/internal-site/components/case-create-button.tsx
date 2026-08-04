"use client";

import { useState, useTransition } from "react";
import { Add } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
} from "@mui/material";
import { cjkKebabCase } from "@magic-compare/shared-utils";
import { useRouter } from "next/navigation";
import { AppNotifications } from "./notifications/app-notifications";
import { useAppNotifications } from "./notifications/use-app-notifications";

const DEFAULT_CASE_SLUG = "new-case";
const EMPTY_CASE_TITLE = "";
const CASE_SUMMARY_MAX_LENGTH = 160;

function normalizeSlug(value: string) {
  return cjkKebabCase(value, DEFAULT_CASE_SLUG);
}

/** Provides the single Case creation flow used by both navigation and catalog actions. */
export function CaseCreateButton({ navigation = false }: { navigation?: boolean }) {
  const router = useRouter();
  const notifications = useAppNotifications();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(EMPTY_CASE_TITLE);
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const normalizedTitle = title.trim();
  const normalizedSlug = normalizeSlug(slug);
  const hasSummaryError = summary.length > CASE_SUMMARY_MAX_LENGTH;
  const canSubmit = Boolean(normalizedTitle && normalizedSlug && !hasSummaryError);

  function resetDraft() {
    // Blank drafts prevent a fast double click from creating a generic, hard-to-identify Case.
    setTitle(EMPTY_CASE_TITLE);
    setSlug("");
    setSummary("");
    setSlugTouched(false);
  }

  function closeDialog() {
    if (isPending) return;
    setOpen(false);
    resetDraft();
  }

  /** Navigates only after creation succeeds so the shell never opens a missing workspace. */
  function submitCase() {
    if (!canSubmit) return;

    startTransition(async () => {
      try {
        const response = await fetch("/api/ops/case-create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            slug: normalizedSlug,
            title: normalizedTitle,
            summary: summary.trim(),
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "创建 Case 失败。");
        }

        const result = (await response.json()) as { caseSlug?: string };
        setOpen(false);
        resetDraft();
        router.push(`/cases/${result.caseSlug ?? normalizedSlug}`);
      } catch (error) {
        notifications.pushNotification(
          error instanceof Error ? error.message : "创建 Case 失败。",
          "error",
        );
      }
    });
  }

  return (
    <>
      {navigation ? (
        <Box sx={{ width: "100%" }}>
          <Tooltip title="新建 Case" placement="right">
            <IconButton
              aria-label="新建 Case"
              onClick={() => setOpen(true)}
              sx={{
                display: { sm: "inline-flex", md: "none" },
                width: 56,
                height: 56,
                color: "primary.contrastText",
                backgroundColor: "primary.main",
                "&:hover": { backgroundColor: "primary.main" },
              }}
            >
              <Add />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setOpen(true)}
            sx={{ display: { sm: "none", md: "inline-flex" }, width: "100%" }}
          >
            新建 Case
          </Button>
        </Box>
      ) : (
        <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>
          新建 Case
        </Button>
      )}

      <Dialog
        open={open}
        onClose={closeDialog}
        fullWidth
        maxWidth="sm"
        slotProps={{
          paper: {
            sx: {
              border: "1px solid",
              borderColor: "divider",
              backgroundColor: "var(--mui-palette-surface-containerHigh)",
            },
          },
        }}
      >
        <DialogTitle>新建 Case</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>创建内部工作区后，再上传对比组。</DialogContentText>
          <Stack spacing={2}>
            <TextField
              label="标题"
              placeholder="例如：2026 夏季动画"
              value={title}
              disabled={isPending}
              autoFocus
              fullWidth
              onChange={(event) => {
                const nextTitle = event.target.value;
                setTitle(nextTitle);
                if (!slugTouched) setSlug(normalizeSlug(nextTitle));
              }}
            />
            <TextField
              label="Slug"
              placeholder="根据标题自动生成"
              value={slug}
              disabled={isPending}
              helperText="用于内部路由，创建后保持不变。"
              fullWidth
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(normalizeSlug(event.target.value));
              }}
            />
            <TextField
              label="描述"
              value={summary}
              disabled={isPending}
              multiline
              minRows={3}
              error={hasSummaryError}
              helperText={`${summary.length}/${CASE_SUMMARY_MAX_LENGTH}`}
              fullWidth
              onChange={(event) => setSummary(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={closeDialog} disabled={isPending}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={submitCase}
            disabled={!canSubmit}
            loading={isPending}
          >
            创建
          </Button>
        </DialogActions>
      </Dialog>
      <AppNotifications
        notifications={notifications.notifications}
        onDismiss={notifications.dismissNotification}
      />
    </>
  );
}
