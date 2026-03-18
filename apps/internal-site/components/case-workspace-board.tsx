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
          p: 1.75,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          backgroundColor: "rgba(255,255,255,0.025)",
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Tooltip title="Drag to reorder within this case">
            <IconButton {...attributes} {...listeners}>
              <DragIndicator />
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1">{group.title}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {group.description || "No group description yet."}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip size="small" label={group.defaultMode} variant="outlined" />
            <Chip size="small" label={`${group.frameCount} frames`} variant="outlined" />
            <Chip size="small" label={group.isPublic ? "public" : "internal"} color={group.isPublic ? "primary" : "default"} />
            <Button
              component={Link}
              href={`/cases/${caseSlug}/groups/${group.slug}`}
              variant="text"
              endIcon={<OpenInNew />}
            >
              Open
            </Button>
          </Stack>
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
    <Stack spacing={2.5}>
      <Paper
        elevation={0}
        sx={{
          p: 2.25,
          borderRadius: 4,
          border: "1px solid",
          borderColor: "divider",
          backgroundColor: "rgba(255,255,255,0.025)",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
        >
          <Box>
            <Typography variant="h4">{data.title}</Typography>
            <Typography variant="body1" color="text.secondary">
              {data.summary || "No summary yet."}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label={data.status} color={data.status === "published" ? "primary" : "default"} />
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
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: 2.25,
          borderRadius: 4,
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
