"use client";

import { useState, useTransition } from "react";
import { Add } from "@mui/icons-material";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { cjkKebabCase } from "@magic-compare/shared-utils";
import { useRouter } from "next/navigation";
import { AppNotifications } from "./notifications/app-notifications";
import { useAppNotifications } from "./notifications/use-app-notifications";

const DEFAULT_CASE_SLUG = "new-case";
const DEFAULT_CASE_TITLE = "New Case";
const CASE_SUMMARY_MAX_LENGTH = 160;

function normalizeSlug(value: string) {
  return cjkKebabCase(value, DEFAULT_CASE_SLUG);
}

/**
 * Keeps Case creation on the catalog surface rather than hiding it inside upload. A new Case starts
 * as metadata only; upload and publish remain separate explicit operations.
 */
export function CaseCreateButton() {
  const router = useRouter();
  const notifications = useAppNotifications();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(DEFAULT_CASE_TITLE);
  const [slug, setSlug] = useState(DEFAULT_CASE_SLUG);
  const [summary, setSummary] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const normalizedTitle = title.trim();
  const normalizedSlug = normalizeSlug(slug);
  const normalizedSummary = summary.trim();
  const hasSummaryError = summary.length > CASE_SUMMARY_MAX_LENGTH;
  const canSubmit = Boolean(normalizedTitle && normalizedSlug && !hasSummaryError);

  function resetDraft() {
    setTitle(DEFAULT_CASE_TITLE);
    setSlug(DEFAULT_CASE_SLUG);
    setSummary("");
    setSlugTouched(false);
  }

  function closeDialog() {
    if (isPending) {
      return;
    }

    setOpen(false);
    resetDraft();
  }

  /**
   * Navigates to the new workspace only after the server accepts the slug, so the catalog never
   * routes users into a case shell that does not exist yet.
   */
  function submitCase() {
    if (!canSubmit) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/ops/case-create", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            slug: normalizedSlug,
            title: normalizedTitle,
            summary: normalizedSummary,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "创建 Case 失败。");
        }

        const result = (await response.json()) as { caseSlug?: string };
        notifications.pushNotification("Case 已创建。", "success");
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
      <Button
        variant="outlined"
        startIcon={<Add />}
        onClick={() => setOpen(true)}
        sx={{ minHeight: 42 }}
      >
        新建 Case
      </Button>
      <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>新建 Case</DialogTitle>
        <DialogContent>
          <Stack spacing={2.1} sx={{ pt: 0.75 }}>
            <TextField
              label="标题"
              value={title}
              disabled={isPending}
              autoFocus
              onChange={(event) => {
                const nextTitle = event.target.value;
                setTitle(nextTitle);
                if (!slugTouched) {
                  setSlug(normalizeSlug(nextTitle));
                }
              }}
            />
            <TextField
              label="Slug"
              value={slug}
              disabled={isPending}
              helperText="用于内部路由，保存后不在此处修改。"
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
              helperText={`${summary.length}/${CASE_SUMMARY_MAX_LENGTH}`}
              error={hasSummaryError}
              onChange={(event) => setSummary(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={isPending}>
            取消
          </Button>
          <Button onClick={submitCase} disabled={isPending || !canSubmit}>
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
