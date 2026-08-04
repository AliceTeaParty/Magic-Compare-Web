"use client";

import { useEffect, useState, useTransition } from "react";
import { CloudUploadOutlined, SettingsOutlined, UploadFileOutlined } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import { InternalPageHeader } from "./internal-page-shell";
import { CaseSettingsPane } from "./case-workspace/case-settings-pane";
import { WorkspaceNotifications } from "./case-workspace/notifications";
import { SortableGroupRow } from "./case-workspace/sortable-group-row";
import { useCaseWorkspaceActions } from "./case-workspace/use-case-workspace-actions";
import { useWorkspaceNotifications } from "./case-workspace/use-workspace-notifications";

type GroupItem = CaseWorkspaceData["groups"][number];

/** Organizes Group review and Case settings as an M3 primary/supporting pane layout. */
export function CaseWorkspaceBoard({
  data,
  canDeployPublicSite,
}: {
  data: CaseWorkspaceData;
  canDeployPublicSite: boolean;
}) {
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [groups, setGroups] = useState(data.groups);
  const [caseTitle, setCaseTitle] = useState(data.title);
  const [caseSummary, setCaseSummary] = useState(data.summary);
  const [caseTags, setCaseTags] = useState(data.tags);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<GroupItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const workspaceNotifications = useWorkspaceNotifications();
  const { dismissNotification, notifications, pushNotification } = workspaceNotifications;
  const {
    publicGroupCount,
    isDeployingPublicSite,
    toggleGroupVisibility,
    deployPublicSite,
    reorderCaseGroups,
    updateGroupMetadata,
    deleteGroup,
  } = useCaseWorkspaceActions({
    caseSummary,
    data,
    groups,
    setCaseSummary,
    setGroups,
    refresh: () => router.refresh(),
    notifications: workspaceNotifications,
    startTransition,
  });

  useEffect(() => setGroups(data.groups), [data.groups]);

  useEffect(() => {
    setCaseTitle(data.title);
    setCaseSummary(data.summary);
    setCaseTags(data.tags);
  }, [data.summary, data.tags, data.title]);

  const deployUnavailableReason = !canDeployPublicSite
    ? "配置 Cloudflare Pages 环境后才能部署。"
    : publicGroupCount === 0
      ? "至少公开一个 Group 后才能部署。"
      : "";

  function handleGroupDragEnd(activeId: string, overId: string | null) {
    reorderCaseGroups(activeId, overId);
  }

  return (
    <>
      <InternalPageHeader
        backHref="/"
        eyebrow="Case 工作区"
        title={caseTitle}
        subtitle={caseSummary || "暂无描述。"}
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<SettingsOutlined />}
              onClick={() => setSettingsOpen(true)}
              sx={{ display: { lg: "none" } }}
            >
              管理 Case
            </Button>
            <Button
              component={Link}
              href={`/upload?case=${encodeURIComponent(data.slug)}`}
              variant="outlined"
              startIcon={<UploadFileOutlined />}
              disabled={isPending || isDeployingPublicSite}
            >
              上传对比
            </Button>
            <Tooltip title={deployUnavailableReason}>
              <span>
                <Button
                  variant="contained"
                  startIcon={<CloudUploadOutlined />}
                  loading={isDeployingPublicSite}
                  disabled={
                    isPending ||
                    !canDeployPublicSite ||
                    publicGroupCount === 0
                  }
                  onClick={deployPublicSite}
                >
                  部署 Pages
                </Button>
              </span>
            </Tooltip>
          </>
        }
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 320px" },
          gap: { xs: 2, lg: 2.5 },
          pt: 2.5,
          alignItems: "start",
        }}
      >
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <WorkspaceNotifications notifications={notifications} onDismiss={dismissNotification} />
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{
              alignItems: { xs: "flex-start", sm: "center" },
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Box>
              <Typography variant="h3">Group</Typography>
              <Typography variant="body2" color="text.secondary">
                拖动调整顺序，设置公开范围，进入 Viewer 检查素材。
              </Typography>
            </Box>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
              <Chip label={`${groups.length} 个 Group`} variant="outlined" />
              <Chip label={`${publicGroupCount} 个公开`} variant="outlined" />
            </Stack>
          </Stack>

          {groups.length > 0 ? (
            <DndContext
              id={`case-workspace-${data.slug}-groups`}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) =>
                handleGroupDragEnd(
                  String(event.active.id),
                  event.over ? String(event.over.id) : null,
                )
              }
            >
              <SortableContext
                items={groups.map((group) => group.id)}
                strategy={rectSortingStrategy}
              >
                <List sx={{ display: "grid", gap: 1, p: 0 }}>
                  {groups.map((group) => (
                    <SortableGroupRow
                      key={group.id}
                      group={group}
                      caseSlug={data.slug}
                      isPending={isPending}
                      onUpdateMetadata={updateGroupMetadata}
                      onToggleVisibility={toggleGroupVisibility}
                      onDelete={setPendingDeleteGroup}
                    />
                  ))}
                </List>
              </SortableContext>
            </DndContext>
          ) : (
            <Stack
              spacing={1.25}
              sx={{
                alignItems: "center",
                py: 7,
                textAlign: "center",
                backgroundColor: "var(--mui-palette-surface-containerLow)",
                borderRadius: 1.5,
              }}
            >
              <Typography variant="h4">还没有 Group</Typography>
              <Typography variant="body2" color="text.secondary">
                上传一组素材后会显示在这里。
              </Typography>
              <Button
                component={Link}
                href={`/upload?case=${encodeURIComponent(data.slug)}`}
                variant="contained"
                startIcon={<UploadFileOutlined />}
              >
                上传对比
              </Button>
            </Stack>
          )}
        </Stack>

        <CaseSettingsPane
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          data={{
            slug: data.slug,
            status: data.status,
            groupCount: groups.length,
            title: caseTitle,
            summary: caseSummary,
            tags: caseTags,
          }}
          onMetadataSaved={(metadata) => {
            setCaseTitle(metadata.title);
            setCaseSummary(metadata.summary);
            setCaseTags(metadata.tags);
          }}
          onNotify={pushNotification}
        />
      </Box>

      {/* A shared M3 dialog replaces per-row native prompts so the destructive action keeps the
          same wording, focus behavior, and pending feedback as the rest of the workbench. */}
      <Dialog
        open={Boolean(pendingDeleteGroup)}
        onClose={() => {
          if (!isPending) setPendingDeleteGroup(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>删除 Group？</DialogTitle>
        <DialogContent>
          <DialogContentText>
            将删除「{pendingDeleteGroup?.title}」的内部素材和已发布输出。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDeleteGroup(null)} disabled={isPending}>
            取消
          </Button>
          <Button
            color="error"
            variant="contained"
            loading={isPending}
            onClick={() => {
              if (!pendingDeleteGroup) return;
              deleteGroup(pendingDeleteGroup);
              setPendingDeleteGroup(null);
            }}
          >
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
