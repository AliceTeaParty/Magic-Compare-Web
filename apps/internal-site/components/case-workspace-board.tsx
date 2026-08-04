"use client";

import { useEffect, useState, useTransition } from "react";
import { SettingsOutlined } from "@mui/icons-material";
import { Box, IconButton, List, Stack, Tooltip, Typography } from "@mui/material";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import { InternalPageHeader } from "./internal-page-shell";
import { CaseSettingsPane } from "./case-workspace/case-settings-pane";
import { DestructiveConfirmationDialog } from "./case-workspace/destructive-confirmation-dialog";
import { WorkspaceNotifications } from "./case-workspace/notifications";
import { SortableGroupRow } from "./case-workspace/sortable-group-row";
import { useCaseWorkspaceActions } from "./case-workspace/use-case-workspace-actions";
import { useWorkspaceNotifications } from "./case-workspace/use-workspace-notifications";
import { useCaseDeployNavigationAction } from "./internal-shell-actions";

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

  // Deployment belongs to the persistent navigation; the workspace only owns its live state and
  // mutation handler so route-specific server data does not leak into the app shell.
  useCaseDeployNavigationAction({
    disabled: isPending || isDeployingPublicSite || !canDeployPublicSite || publicGroupCount === 0,
    disabledReason: deployUnavailableReason,
    loading: isDeployingPublicSite,
    onClick: deployPublicSite,
  });

  function handleGroupDragEnd(activeId: string, overId: string | null) {
    reorderCaseGroups(activeId, overId);
  }

  return (
    <>
      <InternalPageHeader
        title={caseTitle}
        subtitle={caseSummary || "暂无描述。"}
        actions={
          <Tooltip title="管理 Case">
            <IconButton
              aria-label="管理 Case"
              onClick={() => setSettingsOpen(true)}
              sx={{ display: { lg: "none" } }}
            >
              <SettingsOutlined />
            </IconButton>
          </Tooltip>
        }
      />

      <WorkspaceNotifications notifications={notifications} onDismiss={dismissNotification} />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 336px" },
          gap: { xs: 2, lg: 2.5 },
          pt: 2,
          alignItems: "start",
        }}
      >
        <Stack spacing={2} sx={{ minWidth: 0 }}>
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
                <List sx={{ display: "grid", gap: 1.25, p: 0 }}>
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
                backgroundColor: "var(--mui-palette-surface-containerHigh)",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              <Typography variant="h4">还没有 Group</Typography>
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
            publicGroupCount,
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

      <DestructiveConfirmationDialog
        description={`将删除「${pendingDeleteGroup?.title ?? ""}」的内部素材和已发布输出。`}
        loading={isPending}
        onCancel={() => setPendingDeleteGroup(null)}
        onConfirm={() => {
          if (!pendingDeleteGroup) return;
          deleteGroup(pendingDeleteGroup);
          setPendingDeleteGroup(null);
        }}
        open={Boolean(pendingDeleteGroup)}
        title="删除 Group？"
      />
    </>
  );
}
