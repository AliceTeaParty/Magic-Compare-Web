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
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";

/**
 * Keeps each workspace row self-contained so drag handles, visibility controls, and the internal
 * viewer link can evolve without bloating the board container again. The row is now split into a
 * narrow drag column plus separate content and action bands so wrapping controls stay readable.
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
  // Workspace rows do a lot of work on mobile, so drag, visibility, and open controls share a
  // single 40px+ baseline instead of the older mixed 32/36px targets.
  const compactControlHeight = { xs: 42, md: 40 };
  const compactHandleSize = { xs: 42, md: 40 };
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: group.id });

  /**
   * Ignores the ToggleButtonGroup "clear selection" null case because a group must always be either
   * internal or public; allowing deselection would only create a transient impossible state.
   */
  function handleVisibilityChange(
    _event: unknown,
    nextValue: "public" | "internal" | null,
  ) {
    if (!nextValue) {
      return;
    }

    if ((group.isPublic ? "public" : "internal") !== nextValue) {
      onToggleVisibility(group);
    }
  }

  /**
   * Row controls sit inside a sortable container, so pointerdown has to stop at the control edge or
   * DnD will treat a simple visibility/open tap as the start of a drag gesture.
   */
  function stopPointerPropagation(event: ReactPointerEvent<HTMLElement>) {
    event.stopPropagation();
  }

  /**
   * Click bubbling is blocked for the same reason as pointerdown: the row should only drag from
   * the explicit handle, while buttons keep their own single-purpose interaction semantics.
   */
  function stopClickPropagation(event: ReactMouseEvent<HTMLElement>) {
    event.stopPropagation();
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
          p: { xs: 1.55, md: 1.8 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          backgroundColor: "rgba(255,255,255,0.025)",
        }}
      >
        <Stack
          direction="row"
          spacing={{ xs: 1.15, md: 1.4 }}
          alignItems="stretch"
        >
          <Tooltip title="Drag to reorder within this case">
            <IconButton
              {...attributes}
              {...listeners}
              sx={{
                // A dedicated narrow handle column makes the draggable region obvious without
                // turning the whole row into an accidental drag target.
                alignSelf: { xs: "flex-start", md: "stretch" },
                color: "text.secondary",
                opacity: 0.78,
                width: compactHandleSize,
                minWidth: compactHandleSize,
                height: compactHandleSize,
                borderRadius: 2.2,
                border: "1px solid rgba(255,255,255,0.08)",
                backgroundColor: "rgba(255,255,255,0.03)",
              }}
            >
              <DragIndicator />
            </IconButton>
          </Tooltip>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              // Keep title/description above metadata and actions so medium-width layouts do not
              // collapse into one noisy line of chips, toggles, and links.
              display: "grid",
              gap: 1.2,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, lineHeight: 1.15 }}
              >
                {group.title}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                noWrap
                sx={{ mt: 0.6, lineHeight: 1.6, minHeight: "1.6em" }}
              >
                {group.description || "No group description yet."}
              </Typography>
            </Box>
            <Stack
              direction={{ xs: "column", lg: "row" }}
              spacing={{ xs: 1.05, lg: 1.2 }}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", lg: "center" }}
            >
              {/* Only rejoin metadata and actions into a single row when there is enough width to
                  preserve scan order; smaller screens keep the two groups stacked for clarity. */}
              <Stack
                direction="row"
                spacing={0.85}
                flexWrap="wrap"
                useFlexGap
                alignItems="center"
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
              </Stack>
              <Stack
                direction="row"
                spacing={0.9}
                flexWrap="wrap"
                useFlexGap
                alignItems="center"
              >
                {/* These controls act on one group only, so they stay visually grouped here instead
                    of competing with workspace-level actions in the page header. */}
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  onPointerDown={stopPointerPropagation}
                  onClick={stopClickPropagation}
                  sx={{
                    minHeight: compactControlHeight,
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
                    sx={{
                      minHeight: compactControlHeight,
                      px: "10px",
                      py: "2px",
                      fontSize: "0.84rem",
                    }}
                  >
                    <LockOutlined sx={{ mr: 0.55, fontSize: 14.5 }} />
                    Internal
                  </ToggleButton>
                  <ToggleButton
                    value="public"
                    disabled={isPending}
                    sx={{
                      minHeight: compactControlHeight,
                      px: "10px",
                      py: "2px",
                      fontSize: "0.84rem",
                    }}
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
                  onPointerDown={stopPointerPropagation}
                  onClick={stopClickPropagation}
                  sx={{ minHeight: compactControlHeight, px: 1.45 }}
                >
                  Open
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </Paper>
    </ListItem>
  );
}
