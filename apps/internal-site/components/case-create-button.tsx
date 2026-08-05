"use client";

import { useState, useTransition } from "react";
import { Add, AddCircleOutlined } from "@mui/icons-material";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { cjkKebabCase } from "@magic-compare/shared-utils";
import { useRootScrollLock } from "@magic-compare/ui";
import { useRouter } from "next/navigation";
import { useAppNotifications } from "./notifications/use-app-notifications";
import { InternalNavigationItem } from "./internal-navigation-item";

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
  useRootScrollLock(open);

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
        <InternalNavigationItem
          icon={<AddCircleOutlined />}
          iconFeedback="create"
          label="新建"
          onClick={() => setOpen(true)}
        />
      ) : (
        <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>
          新建 Case
        </Button>
      )}

      <Dialog
        open={open}
        onClose={closeDialog}
        // The shared root lock keeps the catalog width fixed while this modal blocks background scroll.
        disableScrollLock
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
        <DialogTitle
          sx={{
            // Explicit M3 dialog hierarchy prevents inherited body typography from making the
            // supporting sentence look larger than the task title.
            px: 3,
            pt: 3,
            pb: 1.25,
            fontSize: "1.25rem",
            fontWeight: 700,
            lineHeight: 1.3,
          }}
        >
          新建 Case
        </DialogTitle>
        <DialogContent>
          <DialogContentText
            sx={{ mb: 2, color: "text.secondary", fontSize: "0.875rem", lineHeight: 1.6 }}
          >
            创建内部工作区后，再上传对比组。
          </DialogContentText>
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
    </>
  );
}
