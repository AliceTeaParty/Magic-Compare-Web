"use client";

import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import {
  Close,
  DeleteOutlined,
  InfoOutlined,
  RadioButtonCheckedRounded,
  SaveOutlined,
  SettingsOutlined,
  TagRounded,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import type { AppNotificationTone } from "../notifications/use-app-notifications";

const statusLabels = {
  draft: "草稿",
  internal: "内部",
  published: "已发布",
  archived: "已归档",
} as const;

/** Keeps immutable Case identity out of editable text fields while preserving easy scanning. */
function SettingsMetadataRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Stack direction="row" sx={{ minWidth: 0, alignItems: "center", gap: 1, minHeight: 32 }}>
      <Box sx={{ display: "flex", color: "primary.main" }}>{icon}</Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="subtitle2" noWrap sx={{ minWidth: 0, ml: "auto" }} title={value}>
        {value}
      </Typography>
    </Stack>
  );
}

interface CaseSettingsPaneProps {
  data: Pick<CaseWorkspaceData, "slug" | "status"> & {
    groupCount: number;
    summary: string;
    tags: string[];
    title: string;
  };
  onMetadataSaved: (metadata: { title: string; summary: string; tags: string[] }) => void;
  onNotify: (message: string, tone: AppNotificationTone) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/** Owns Case metadata drafts so editing never changes the page title before a successful save. */
export function CaseSettingsPane({
  data,
  onMetadataSaved,
  onNotify,
  onOpenChange,
  open,
}: CaseSettingsPaneProps) {
  const router = useRouter();
  const [title, setTitle] = useState(data.title);
  const [summary, setSummary] = useState(data.summary);
  const [tagsText, setTagsText] = useState(data.tags.join(", "));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const tags = tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const canSave = Boolean(title.trim()) && summary.length <= 160;

  useEffect(() => {
    setTitle(data.title);
    setSummary(data.summary);
    setTagsText(data.tags.join(", "));
  }, [data.summary, data.tags, data.title]);

  /** Restores the committed snapshot when a temporary drawer closes so cancelled edits do not
   * reappear the next time settings are opened. */
  function closeSettings() {
    if (isPending) return;
    setTitle(data.title);
    setSummary(data.summary);
    setTagsText(data.tags.join(", "));
    onOpenChange(false);
  }

  /** Persists the complete operator-editable metadata set through one update contract. */
  function saveMetadata() {
    if (!canSave) return;
    startTransition(async () => {
      try {
        const response = await fetch("/api/ops/case-update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ caseSlug: data.slug, title, summary, tags }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "保存 Case 失败。");
        }
        const result = (await response.json()) as {
          title: string;
          summary: string;
          tags: string[];
        };
        onMetadataSaved(result);
        onNotify("Case 设置已保存。", "success");
        onOpenChange(false);
      } catch (error) {
        onNotify(error instanceof Error ? error.message : "保存 Case 失败。", "error");
      }
    });
  }

  /** Deletes only an empty Case, matching the server guard that protects group assets. */
  function deleteCase() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/ops/case-delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ caseSlug: data.slug }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "删除 Case 失败。");
        }
        router.push("/");
        router.refresh();
      } catch (error) {
        setConfirmDelete(false);
        onNotify(error instanceof Error ? error.message : "删除 Case 失败。", "error");
      }
    });
  }

  const content = (
    <Stack sx={{ height: "100%", minHeight: 0 }}>
      <Stack
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, px: 2.25, py: 1.75 }}
      >
        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
          <SettingsOutlined color="primary" />
          <Typography variant="h4">Case 设置</Typography>
        </Stack>
        <IconButton
          aria-label="关闭 Case 设置"
          onClick={closeSettings}
          sx={{ display: { lg: "none" } }}
        >
          <Close />
        </IconButton>
      </Stack>
      <Divider />
      <Stack spacing={1.75} sx={{ p: 2.25, overflowY: "auto" }}>
        <TextField
          size="small"
          label="标题"
          value={title}
          disabled={isPending}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextField
          size="small"
          label="描述"
          value={summary}
          multiline
          minRows={3}
          disabled={isPending}
          error={summary.length > 160}
          helperText={`${summary.length}/160`}
          onChange={(event) => setSummary(event.target.value)}
        />
        <TextField
          size="small"
          label="标签"
          value={tagsText}
          disabled={isPending}
          helperText="使用英文逗号分隔"
          onChange={(event) => setTagsText(event.target.value)}
        />
        <Stack
          spacing={0.5}
          sx={{
            px: 1.25,
            py: 0.75,
            borderRadius: 1.5,
            backgroundColor: "var(--mui-palette-surface-containerHighest)",
          }}
        >
          <SettingsMetadataRow
            icon={<TagRounded sx={{ fontSize: 18 }} />}
            label="Slug"
            value={data.slug}
          />
          <SettingsMetadataRow
            icon={<RadioButtonCheckedRounded sx={{ fontSize: 18 }} />}
            label="发布状态"
            value={statusLabels[data.status]}
          />
        </Stack>
        <Button
          fullWidth
          variant="contained"
          startIcon={<SaveOutlined />}
          disabled={!canSave}
          loading={isPending}
          onClick={saveMetadata}
        >
          保存设置
        </Button>

        <Divider sx={{ my: 1 }} />
        {data.groupCount > 0 ? (
          <Stack
            direction="row"
            sx={{
              alignItems: "flex-start",
              gap: 1,
              p: 1.25,
              borderRadius: 1.5,
              color: "text.secondary",
              backgroundColor: "var(--mui-palette-surface-containerHighest)",
            }}
          >
            <InfoOutlined sx={{ mt: 0.1, fontSize: 18, flexShrink: 0 }} />
            <Typography variant="caption">删除 Case 前需要先删除其中的全部 Group。</Typography>
          </Stack>
        ) : null}
        <Button
          fullWidth
          color="error"
          variant="text"
          startIcon={<DeleteOutlined />}
          disabled={isPending || data.groupCount > 0}
          onClick={() => setConfirmDelete(true)}
        >
          删除 Case
        </Button>
      </Stack>
    </Stack>
  );

  return (
    <>
      <Box
        component="aside"
        sx={{
          // Keep responsive branches stable across SSR and hydration; CSS decides which settings
          // surface is visible without replacing the rendered subtree after mount.
          display: { xs: "none", lg: "block" },
          minWidth: 0,
          position: "sticky",
          top: 16,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          backgroundColor: "var(--mui-palette-surface-containerHigh)",
        }}
      >
        {content}
      </Box>

      <Drawer
        anchor="right"
        open={open}
        onClose={closeSettings}
        sx={{ display: { lg: "none" } }}
        slotProps={{
          paper: {
            sx: {
              width: "min(92vw, 400px)",
              backgroundColor: "var(--mui-palette-surface-containerHigh)",
            },
          },
        }}
      >
        {content}
      </Drawer>

      <Dialog
        open={confirmDelete}
        onClose={() => {
          if (!isPending) setConfirmDelete(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>删除 Case？</DialogTitle>
        <DialogContent>
          <DialogContentText>将永久删除「{data.title}」的元数据。</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)} disabled={isPending}>
            取消
          </Button>
          <Button color="error" variant="contained" onClick={deleteCase} loading={isPending}>
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
