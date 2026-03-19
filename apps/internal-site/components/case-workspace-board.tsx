"use client";

import { useState, useTransition } from "react";
import {
  CloudUpload,
  DragIndicator,
  FileUpload,
  OpenInNew,
  Public,
  Publish,
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
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";

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
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 1.2, md: 1.35 }}
          alignItems={{ xs: "stretch", md: "center" }}
        >
          <Tooltip title="Drag to reorder within this case">
            <IconButton
              {...attributes}
              {...listeners}
              sx={{
                alignSelf: { xs: "flex-start", md: "center" },
                color: "text.secondary",
                width: 34,
                height: 34,
              }}
            >
              <DragIndicator />
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.15 }}>
              {group.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.55 }}>
              {group.description || "No group description yet."}
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: { xs: "flex-start", md: "flex-end" },
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
              sx={{ height: 34, "& .MuiChip-label": { px: 1.35 } }}
            />
            <Chip
              size="small"
              label={group.isPublic ? "public" : "internal"}
              color={group.isPublic ? "primary" : "default"}
              sx={{ height: 34, "& .MuiChip-label": { px: 1.35 } }}
            />
            <Button
              variant="outlined"
              size="small"
              startIcon={<Public />}
              disabled={isPending}
              onClick={() => onToggleVisibility(group)}
              sx={{ minHeight: 34, px: 1.35 }}
            >
              {group.isPublic ? "Make internal" : "Make public"}
            </Button>
            <Button
              component={Link}
              href={`/cases/${caseSlug}/groups/${group.slug}`}
              variant="text"
              size="small"
              endIcon={<OpenInNew />}
              sx={{ minHeight: 34, px: 1.35 }}
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
  publicExportDir,
}: {
  data: CaseWorkspaceData;
  canDeployPublicSite: boolean;
  publicExportDir: string;
}) {
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [groups, setGroups] = useState(data.groups);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success" | null>(null);
  const [publicSiteAction, setPublicSiteAction] = useState<"export" | "deploy" | null>(null);

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

  async function exportPublicSite() {
    const response = await fetch("/api/ops/public-export", {
      method: "POST",
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Failed to export public site.");
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
      setFeedback(null);
      setFeedbackTone(null);
      void updateGroupVisibility(targetGroup.slug, nextVisibility)
        .then(() => {
          setFeedback(
            nextVisibility
              ? `Marked ${targetGroup.title} as public. Publish the case to refresh the public bundle.`
              : `Marked ${targetGroup.title} as internal. Publish the case to remove it from the next public bundle.`,
          );
          setFeedbackTone("success");
          router.refresh();
        })
        .catch((error) => {
          setGroups(previousGroups);
          setFeedback(
            error instanceof Error ? error.message : "Failed to update group visibility.",
          );
          setFeedbackTone("error");
        });
    });
  }

  return (
    <Stack spacing={{ xs: 2.25, md: 3 }}>
      <Stack spacing={1.7} sx={{ maxWidth: 980 }}>
        <Typography variant="overline" color="primary.main">
          Case workspace
        </Typography>
        <Box
          sx={{
            display: "grid",
            gap: { xs: 1.4, xl: 1.85 },
            alignItems: "start",
            gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1.18fr) auto" },
            pb: 2.65,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Stack spacing={1.1} sx={{ minWidth: 0, pr: { xl: 2 } }}>
            <Typography variant="h2" sx={{ lineHeight: 0.98 }}>
              {data.title}
            </Typography>
            <Stack direction="row" spacing={0.9} flexWrap="wrap" useFlexGap>
              <Chip
                label={data.status}
                color={data.status === "published" ? "primary" : "default"}
                sx={{ height: 36, "& .MuiChip-label": { px: 1.4 } }}
              />
              <Chip
                label={`${groups.length} groups`}
                variant="outlined"
                sx={{ height: 36, "& .MuiChip-label": { px: 1.4 } }}
              />
            </Stack>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 760 }}>
              {data.summary || "No summary yet."}
            </Typography>
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
                minHeight: 40,
              },
            }}
          >
            <Button
              variant="contained"
              startIcon={<Publish />}
              disabled={isPending || groups.length === 0}
              onClick={() =>
                startTransition(() => {
                  setFeedback(null);
                  setFeedbackTone(null);
                  void publishCurrentCase()
                    .then(() => {
                      setFeedback("Published case bundle to the shared published root.");
                      setFeedbackTone("success");
                      router.refresh();
                    })
                    .catch((error) => {
                      setFeedback(error instanceof Error ? error.message : "Failed to publish case.");
                      setFeedbackTone("error");
                    });
                })
              }
            >
              Publish case
            </Button>
            <Button
              variant="outlined"
              startIcon={<FileUpload />}
              disabled={isPending || publicSiteAction !== null}
              onClick={() => {
                if (publicSiteAction) {
                  return;
                }

                setPublicSiteAction("export");
                startTransition(() => {
                  setFeedback(null);
                  setFeedbackTone(null);
                  void exportPublicSite()
                    .then((result) => {
                      setFeedback(`Exported static public site to ${result.exportDir}.`);
                      setFeedbackTone("success");
                    })
                    .catch((error) => {
                      setFeedback(
                        error instanceof Error ? error.message : "Failed to export public site.",
                      );
                      setFeedbackTone("error");
                    })
                    .finally(() => {
                      setPublicSiteAction(null);
                    });
                });
              }}
            >
              Export public site
            </Button>
            <Button
              variant="outlined"
              startIcon={<CloudUpload />}
              disabled={isPending || publicSiteAction !== null || !canDeployPublicSite}
              onClick={() => {
                if (publicSiteAction) {
                  return;
                }

                setPublicSiteAction("deploy");
                startTransition(() => {
                  setFeedback(null);
                  setFeedbackTone(null);
                  void deployPublicSite()
                    .then((result) => {
                      setFeedback(
                        `Deployed fresh static export to Cloudflare Pages project ${result.projectName}.`,
                      );
                      setFeedbackTone("success");
                    })
                    .catch((error) => {
                      setFeedback(
                        error instanceof Error ? error.message : "Failed to deploy public site.",
                      );
                      setFeedbackTone("error");
                    })
                    .finally(() => {
                      setPublicSiteAction(null);
                    });
                });
              }}
            >
              Deploy to Pages
            </Button>
          </Stack>
        </Box>
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary">
            Export and deploy operate on all published groups. Static export target: {publicExportDir}
          </Typography>
          {!canDeployPublicSite ? (
            <Typography variant="caption" color="warning.main">
              Deploy to Pages is disabled until Cloudflare Pages env is configured.
            </Typography>
          ) : null}
          {feedback ? (
            <Typography
              variant="caption"
              color={feedbackTone === "error" ? "error.main" : "primary.main"}
            >
              {feedback}
            </Typography>
          ) : null}
        </Stack>
      </Stack>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 2.5 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          backgroundColor: "rgba(255,255,255,0.025)",
        }}
      >
        <Stack spacing={1.5}>
          <Typography variant="h6">Groups</Typography>
          <Typography variant="body2" color="text.secondary">
            Drag to define case order. Group pages open in the viewer workbench.
          </Typography>
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
                void saveGroupOrder(reordered.map((group) => group.id)).then(() => router.refresh());
              });
            }}
          >
            <SortableContext items={groups.map((group) => group.id)} strategy={rectSortingStrategy}>
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
          {isPending ? (
            <Typography variant="caption" color="primary.main">
              Saving workspace updates...
            </Typography>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  );
}
