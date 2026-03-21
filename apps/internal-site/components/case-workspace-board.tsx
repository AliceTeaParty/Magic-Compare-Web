"use client";

import { useEffect, useState, useTransition } from "react";
import { CloudUpload, Publish } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  List,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import { WorkspaceNotifications } from "./case-workspace/notifications";
import { SortableGroupRow } from "./case-workspace/sortable-group-row";
import { useCaseWorkspaceActions } from "./case-workspace/use-case-workspace-actions";
import { useWorkspaceNotifications } from "./case-workspace/use-workspace-notifications";

/**
 * Keeps workspace-level publish/deploy controls alongside sortable group rows so operators can
 * reorder and publish from one surface without desynchronizing local optimistic state.
 */
export function CaseWorkspaceBoard({
  data,
  canDeployPublicSite,
}: {
  data: CaseWorkspaceData;
  canDeployPublicSite: boolean;
}) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const [groups, setGroups] = useState(data.groups);
  const [isPending, startTransition] = useTransition();
  const workspaceNotifications = useWorkspaceNotifications();
  const { dismissNotification, notifications, pushNotification } =
    workspaceNotifications;
  const {
    publicGroupCount,
    isDeployingPublicSite,
    toggleGroupVisibility,
    publishCaseBundle,
    deployPublicSite,
    reorderCaseGroups,
  } = useCaseWorkspaceActions({
    data,
    groups,
    setGroups,
    refresh: () => router.refresh(),
    notifications: workspaceNotifications,
    startTransition,
  });

  // Router refreshes can replace the canonical server ordering/visibility, so optimistic local
  // state has to realign when the loader payload changes.
  useEffect(() => {
    setGroups(data.groups);
  }, [data.groups]);

  useEffect(() => {
    if (publicGroupCount === 0) {
      pushNotification(
        "This case has no public groups yet. Use the per-group internal/public toggle below before publishing.",
        "warning",
        { key: "workspace-no-public-groups", sticky: true },
      );
      return;
    }

    dismissNotification("workspace-no-public-groups");
  }, [dismissNotification, publicGroupCount, pushNotification]);

  /**
   * Drag-end is normalized here so the DnD library stays at the board boundary while reorder rules
   * continue to live in the dedicated workspace actions hook.
   */
  function handleGroupDragEnd(activeId: string, overId: string | null) {
    reorderCaseGroups(activeId, overId);
  }

  return (
    <Stack spacing={{ xs: 2.25, md: 3 }}>
      <Box
        component={motion.div}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <Stack spacing={1.9} sx={{ width: "100%" }}>
          <Typography variant="overline" color="primary.main">
            Case workspace
          </Typography>
          <Box
            sx={{
              display: "grid",
              gap: { xs: 1.8, xl: 2.2 },
              alignItems: "start",
              gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1.22fr) auto" },
              pb: { xs: 2.8, md: 3.1 },
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Stack spacing={1.6} sx={{ minWidth: 0, pr: { xl: 2.2 } }}>
              <Typography variant="h2" sx={{ lineHeight: 0.98 }}>
                {data.title}
              </Typography>
              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ maxWidth: 820 }}
              >
                {data.summary || "No summary yet."}
              </Typography>
              <Stack
                direction="row"
                spacing={0.9}
                flexWrap="wrap"
                useFlexGap
                sx={{ pt: 0.25 }}
              >
                <Chip
                  label={data.status}
                  color={data.status === "published" ? "primary" : "default"}
                  sx={{ height: 38, "& .MuiChip-label": { px: 1.55 } }}
                />
                <Chip
                  label={`${groups.length} groups`}
                  variant="outlined"
                  sx={{ height: 38, "& .MuiChip-label": { px: 1.55 } }}
                />
                <Chip
                  label={`${publicGroupCount} public`}
                  variant="outlined"
                  sx={{ height: 38, "& .MuiChip-label": { px: 1.55 } }}
                />
              </Stack>
            </Stack>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent={{ xs: "flex-start", xl: "flex-end" }}
              flexWrap="wrap"
              useFlexGap
              sx={{
                "& .MuiButton-root": {
                  minHeight: 42,
                  px: 2.1,
                },
              }}
            >
              <Button
                variant="contained"
                startIcon={<Publish />}
                disabled={isPending || groups.length === 0}
                onClick={publishCaseBundle}
              >
                Publish Case
              </Button>
              <Tooltip
                title={
                  canDeployPublicSite
                    ? ""
                    : "Deploy Pages is disabled until Cloudflare Pages env is configured."
                }
              >
                <span>
                  <Button
                    variant="outlined"
                    startIcon={<CloudUpload />}
                    disabled={
                      isPending || isDeployingPublicSite || !canDeployPublicSite
                    }
                    onClick={deployPublicSite}
                  >
                    Deploy Pages
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </Box>
        </Stack>
      </Box>

      <Box
        component={motion.div}
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.2, md: 2.7 },
            borderRadius: 3.5,
            border: "1px solid",
            borderColor: "divider",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
          }}
        >
          <Stack spacing={1.65}>
            <Stack spacing={0.6}>
              <Typography variant="h6">Groups</Typography>
              <Typography variant="body2" color="text.secondary">
                Drag to define case order. Group pages open in the viewer
                workbench.
              </Typography>
            </Stack>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => {
                handleGroupDragEnd(
                  String(event.active.id),
                  event.over ? String(event.over.id) : null,
                );
              }}
            >
              <SortableContext
                items={groups.map((group) => group.id)}
                strategy={rectSortingStrategy}
              >
                <List sx={{ display: "grid", gap: 1.25 }}>
                  {groups.map((group) => (
                    <SortableGroupRow
                      key={group.id}
                      group={group}
                      caseSlug={data.slug}
                      isPending={isPending}
                      onToggleVisibility={toggleGroupVisibility}
                    />
                  ))}
                </List>
              </SortableContext>
            </DndContext>
          </Stack>
        </Paper>
      </Box>

      <WorkspaceNotifications
        notifications={notifications}
        onDismiss={dismissNotification}
      />
    </Stack>
  );
}
