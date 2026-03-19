"use client";

import { useState, useTransition } from "react";
import {
  DragIndicator,
  OpenInNew,
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
}: {
  group: CaseWorkspaceData["groups"][number];
  caseSlug: string;
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
          p: { xs: 1.5, md: 1.75 },
          borderRadius: 2.5,
          border: "1px solid",
          borderColor: "divider",
          backgroundColor: "rgba(255,255,255,0.025)",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 1.25, md: 1.5 }}
          alignItems={{ xs: "stretch", md: "center" }}
        >
          <Tooltip title="Drag to reorder within this case">
            <IconButton
              {...attributes}
              {...listeners}
              sx={{
                alignSelf: { xs: "flex-start", md: "center" },
                color: "text.secondary",
              }}
            >
              <DragIndicator />
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {group.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {group.description || "No group description yet."}
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: { xs: "flex-start", md: "flex-end" },
              gap: 1,
              flexWrap: "wrap",
            }}
          >
            <Chip size="small" label={group.defaultMode} variant="outlined" />
            <Chip size="small" label={`${group.frameCount} frames`} variant="outlined" />
            <Chip
              size="small"
              label={group.isPublic ? "public" : "internal"}
              color={group.isPublic ? "primary" : "default"}
            />
            <Button
              component={Link}
              href={`/cases/${caseSlug}/groups/${group.slug}`}
              variant="text"
              size="small"
              endIcon={<OpenInNew />}
            >
              Open
            </Button>
          </Box>
        </Stack>
      </Paper>
    </ListItem>
  );
}

export function CaseWorkspaceBoard({ data }: { data: CaseWorkspaceData }) {
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [groups, setGroups] = useState(data.groups);
  const [isPending, startTransition] = useTransition();

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
      throw new Error("Failed to publish case.");
    }
  }

  return (
    <Stack spacing={{ xs: 2.25, md: 3 }}>
      <Stack spacing={1.5} sx={{ maxWidth: 940 }}>
        <Typography variant="overline" color="primary.main">
          Case workspace
        </Typography>
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            alignItems: "end",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.1fr) auto" },
            pb: 2.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box>
            <Typography variant="h2">{data.title}</Typography>
            <Typography variant="body1" color="text.secondary">
              {data.summary || "No summary yet."}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              label={data.status}
              color={data.status === "published" ? "primary" : "default"}
            />
            <Button
              variant="contained"
              startIcon={<Publish />}
              disabled={isPending || groups.length === 0}
              onClick={() =>
                startTransition(() => {
                  void publishCurrentCase().then(() => router.refresh());
                })
              }
            >
              Publish case
            </Button>
          </Stack>
        </Box>
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
                  <SortableGroupRow key={group.id} group={group} caseSlug={data.slug} />
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
