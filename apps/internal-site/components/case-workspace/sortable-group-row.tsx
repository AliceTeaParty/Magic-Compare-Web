import {
  DragIndicator,
  LockOutlined,
  OpenInNew,
  Public,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  IconButton,
  ListItem,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";

/**
 * Keeps each workspace row self-contained so drag handles, visibility controls, and the internal
 * viewer link can evolve without bloating the board container again.
 */
export function SortableGroupRow({
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

  /**
   * Ignores the ToggleButtonGroup "clear selection" null case because a group must always be either
   * internal or public; allowing deselection would only create a transient impossible state.
   */
  function handleVisibilityChange(_event: unknown, nextValue: "public" | "internal" | null) {
    if (!nextValue) {
      return;
    }

    if ((group.isPublic ? "public" : "internal") !== nextValue) {
      onToggleVisibility(group);
    }
  }

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
              onChange={handleVisibilityChange}
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
