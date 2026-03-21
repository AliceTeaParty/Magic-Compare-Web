"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CheckCircleOutline,
  Close,
  CloudUpload,
  DragIndicator,
  ErrorOutline,
  InfoOutlined,
  LockOutlined,
  OpenInNew,
  Public,
  Publish,
  WarningAmber,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";

type WorkspaceNotificationTone = "error" | "info" | "success" | "warning";

interface WorkspaceNotification {
  id: string;
  message: string;
  tone: WorkspaceNotificationTone;
  sticky?: boolean;
}

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

function SortableGroupRow({
  group,
  caseSlug,
  isPending,
  onToggleVisibility,
}: {
  group: CaseWorkspaceData["groups"][number];
  caseSlug: string;
  isPending: boolean;
  onToggleVisibility: (group: CaseWorkspaceData["groups"][number]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: group.id });

  return (
    <ListItem
      ref={setNodeRef}
      disablePadding
      sx={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          p: { xs: 1.6, md: 1.9 },
          borderRadius: 2.5,
          border: "1px solid",
          borderColor: "divider",
          backgroundColor: "rgba(255,255,255,0.025)",
        }}
      >
        <Stack
          direction={{ xs: "column", xl: "row" }}
          spacing={{ xs: 1.25, xl: 1.5 }}
          alignItems={{ xs: "stretch", xl: "center" }}
        >
          <Tooltip title="Drag to reorder within this case">
            <IconButton
              {...attributes}
              {...listeners}
              sx={{
                alignSelf: { xs: "flex-start", xl: "center" },
                color: "text.secondary",
                opacity: 0.78,
                width: 34,
                height: 34,
              }}
            >
              <DragIndicator />
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1, minWidth: 0, pr: { xl: 1 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.15 }}>
              {group.title}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{ mt: 0.65, lineHeight: 1.6, minHeight: "1.6em" }}
            >
              {group.description || "No group description yet."}
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: { xs: "flex-start", xl: "flex-end" },
              gap: 0.9,
              flexWrap: "wrap",
            }}
          >
            <Chip
              size="small"
              label={group.defaultMode}
              variant="outlined"
              sx={{ height: 34, "& .MuiChip-label": { px: 1.35 } }}
            />
            <Chip
              size="small"
              label={`${group.frameCount} frames`}
              variant="outlined"
              sx={{ height: 36, "& .MuiChip-label": { px: 1.35 } }}
            />
            <ToggleButtonGroup
              exclusive
              size="small"
              sx={{
                minHeight: 32,
                px: 0.25,
                py: 0.25,
                borderRadius: 999,
                border: "1px solid",
                borderColor: "divider",
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
              value={group.isPublic ? "public" : "internal"}
              onChange={(_, nextValue: "public" | "internal" | null) => {
                if (!nextValue) {
                  return;
                }

                if ((group.isPublic ? "public" : "internal") !== nextValue) {
                  onToggleVisibility(group);
                }
              }}
            >
              <ToggleButton
                value="internal"
                disabled={isPending}
                sx={{ minHeight: 32, px: "10px", py: "2px", fontSize: "0.84rem" }}
              >
                <LockOutlined sx={{ mr: 0.55, fontSize: 14.5 }} />
                Internal
              </ToggleButton>
              <ToggleButton
                value="public"
                disabled={isPending}
                sx={{ minHeight: 32, px: "10px", py: "2px", fontSize: "0.84rem" }}
              >
                <Public sx={{ mr: 0.55, fontSize: 14.5 }} />
                Public
              </ToggleButton>
            </ToggleButtonGroup>
            <Button
              component={Link}
              href={`/cases/${caseSlug}/groups/${group.slug}`}
              variant="text"
              size="small"
              endIcon={<OpenInNew />}
              sx={{ minHeight: 36, px: 1.45 }}
            >
              Open
            </Button>
          </Box>
        </Stack>
      </Paper>
    </ListItem>
  );
}

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
  const [isPending, startTransition] = useTransition();
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [isDeployingPublicSite, setIsDeployingPublicSite] = useState(false);
  const publicGroupCount = groups.filter((group) => group.isPublic).length;

  function dismissNotification(notificationId: string) {
    setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
  }

  function pushNotification(
    message: string,
    tone: WorkspaceNotificationTone,
    options?: { key?: string; sticky?: boolean },
  ) {
    const notificationId = options?.key ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setNotifications((current) => {
      const next = [
        {
          id: notificationId,
          message,
          tone,
          sticky: options?.sticky,
        },
        ...current.filter((notification) => notification.id !== notificationId),
      ];

      return next.slice(0, 4);
    });

    if (!options?.sticky) {
      window.setTimeout(() => {
        setNotifications((current) =>
          current.filter((notification) => notification.id !== notificationId),
        );
      }, 4200);
    }
  }

  async function saveGroupOrder(nextGroupIds: string[]) {
    const response = await fetch("/api/ops/group-reorder", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        caseId: data.id,
        groupIds: nextGroupIds,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to persist group order.");
    }
  }

  async function publishCurrentCase() {
    const response = await fetch("/api/ops/case-publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        caseId: data.id,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Failed to publish case.");
    }

    return response.json();
  }

  async function deployPublicSite() {
    const response = await fetch("/api/ops/public-deploy", {
      method: "POST",
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Failed to deploy public site.");
    }

    return response.json();
  }

  async function updateGroupVisibility(groupSlug: string, isPublic: boolean) {
    const response = await fetch("/api/ops/group-visibility", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        caseSlug: data.slug,
        groupSlug,
        isPublic,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Failed to update group visibility.");
    }

    return response.json();
  }

  function toggleGroupVisibility(targetGroup: CaseWorkspaceData["groups"][number]) {
    const previousGroups = groups;
    const nextVisibility = !targetGroup.isPublic;
    const nextGroups = groups.map((group) =>
      group.id === targetGroup.id ? { ...group, isPublic: nextVisibility } : group,
    );

    setGroups(nextGroups);

    startTransition(() => {
      void updateGroupVisibility(targetGroup.slug, nextVisibility)
        .then(() => {
          pushNotification(
            nextVisibility
              ? `Marked ${targetGroup.title} as public. Publish the case to refresh the public bundle.`
              : `Marked ${targetGroup.title} as internal. Publish the case to remove it from the next public bundle.`,
            "success",
          );
          router.refresh();
        })
        .catch((error) => {
          setGroups(previousGroups);
          pushNotification(
            error instanceof Error ? error.message : "Failed to update group visibility.",
            "error",
          );
        });
    });
  }

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
  }, [publicGroupCount]);

  useEffect(() => {
    if (isPending) {
      pushNotification("Saving workspace updates...", "info", {
        key: "workspace-saving",
        sticky: true,
      });
      return;
    }

    dismissNotification("workspace-saving");
  }, [isPending]);

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
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 820 }}>
                {data.summary || "No summary yet."}
              </Typography>
              <Stack direction="row" spacing={0.9} flexWrap="wrap" useFlexGap sx={{ pt: 0.25 }}>
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
                onClick={() =>
                  startTransition(() => {
                    void publishCurrentCase()
                      .then(() => {
                        pushNotification(
                          "Published case bundle to the shared published root.",
                          "success",
                        );
                        router.refresh();
                      })
                      .catch((error) => {
                        pushNotification(
                          error instanceof Error ? error.message : "Failed to publish case.",
                          "error",
                        );
                      });
                  })
                }
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
                    disabled={isPending || isDeployingPublicSite || !canDeployPublicSite}
                    onClick={() => {
                      if (isDeployingPublicSite) {
                        return;
                      }

                      setIsDeployingPublicSite(true);
                      startTransition(() => {
                        void deployPublicSite()
                          .then((result) => {
                            pushNotification(
                              `Deployed fresh static export to Cloudflare Pages project ${result.projectName}.`,
                              "success",
                            );
                          })
                          .catch((error) => {
                            pushNotification(
                              error instanceof Error ? error.message : "Failed to deploy public site.",
                              "error",
                            );
                          })
                          .finally(() => {
                            setIsDeployingPublicSite(false);
                          });
                      });
                    }}
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
                Drag to define case order. Group pages open in the viewer workbench.
              </Typography>
            </Stack>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => {
                const activeId = String(event.active.id);
                const overId = event.over ? String(event.over.id) : null;

                if (!overId || activeId === overId) {
                  return;
                }

                const oldIndex = groups.findIndex((group) => group.id === activeId);
                const newIndex = groups.findIndex((group) => group.id === overId);

                if (oldIndex === -1 || newIndex === -1) {
                  return;
                }

                const reordered = arrayMove(groups, oldIndex, newIndex).map((group, order) => ({
                  ...group,
                  order,
                }));

                setGroups(reordered);
                startTransition(() => {
                  void saveGroupOrder(reordered.map((group) => group.id)).then(() =>
                    router.refresh(),
                  );
                });
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
                onDismiss={dismissNotification}
              />
            ))}
          </AnimatePresence>
        </Stack>
      </Box>
    </Stack>
  );
}
