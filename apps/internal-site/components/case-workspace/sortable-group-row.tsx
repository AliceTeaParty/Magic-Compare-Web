import {
  ArrowForwardRounded,
  Check,
  Close,
  DeleteOutlined,
  DragIndicator,
  EditOutlined,
  LockOutlined,
  PhotoLibraryOutlined,
  Public,
} from "@mui/icons-material";
import {
  Box,
  Chip,
  IconButton,
  ListItem,
  Paper,
  Stack,
  ToggleButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { MagicSegmentedControl } from "@magic-compare/ui";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import { inlineEditTextSx } from "./inline-edit-text-sx";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_TITLE_MAX_LENGTH,
  useGroupMetadataEditor,
} from "./use-group-metadata-editor";

type GroupItem = CaseWorkspaceData["groups"][number];
const metadataChipSx = {
  height: 30,
  border: 0,
  color: "text.secondary",
  backgroundColor: "var(--mui-palette-surface-containerHigh)",
  "& .MuiChip-icon": { ml: 1, color: "inherit", fontSize: 17 },
  "& .MuiChip-label": { px: 1.15 },
} as const;

/**
 * Keeps each workspace row self-contained so drag handles, visibility controls, and the internal
 * viewer link can evolve without bloating the board container again. The row is now split into a
 * narrow drag column plus separate content and action bands so wrapping controls stay readable.
 */
export function SortableGroupRow({
  group,
  caseSlug,
  isPending,
  onUpdateMetadata,
  onToggleVisibility,
  onDelete,
}: {
  group: GroupItem;
  caseSlug: string;
  isPending: boolean;
  onUpdateMetadata: (
    group: GroupItem,
    metadata: { title: string; description: string },
  ) => Promise<void>;
  onToggleVisibility: (group: GroupItem) => void;
  onDelete: (group: GroupItem) => void;
}) {
  // Touch layouts retain a 40px target while desktop controls use the denser 36px workbench row.
  const compactControlHeight = { xs: 40, md: 36 };
  const compactHandleSize = { xs: 40, md: 36 };
  const visibilityButtonHeight = compactControlHeight;
  const visibilityButtonSx = {
    minHeight: visibilityButtonHeight,
    px: "10px",
    py: 0,
    fontSize: "0.8125rem",
  };
  const {
    cancelMetadataEdit,
    descriptionEditorRef,
    draftDescription,
    draftTitle,
    hasMetadataError,
    isDescriptionOverLimit,
    isEditing,
    isTitleOverLimit,
    saveMetadataEdit,
    startMetadataEdit,
    syncDescription,
    syncTitle,
    titleEditorRef,
  } = useGroupMetadataEditor({ group, onUpdateMetadata });
  const visibleExtraAssetLabels = group.extraAssetLabels.slice(0, 3);
  const hiddenExtraAssetLabelCount = group.extraAssetLabels.length - visibleExtraAssetLabels.length;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: group.id,
  });

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

  function handleOpenClick(event: ReactMouseEvent<HTMLElement>) {
    stopClickPropagation(event);
    if (isPending || isEditing) {
      event.preventDefault();
    }
  }

  function handleDeleteClick(event: ReactMouseEvent<HTMLButtonElement>) {
    stopClickPropagation(event);

    if (isPending || isEditing) {
      return;
    }

    onDelete(group);
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
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          backgroundColor: "var(--mui-palette-surface-containerHigh)",
        }}
      >
        <Stack
          direction="row"
          spacing={{ xs: 1.15, md: 1.4 }}
          sx={{
            alignItems: "stretch",
            p: { xs: 1.5, md: 1.75 },
          }}
        >
          <Tooltip title="拖动调整此项目内的顺序。">
            <IconButton
              {...attributes}
              {...listeners}
              disabled={isPending || isEditing}
              sx={{
                // A dedicated narrow handle column makes the draggable region obvious without
                // turning the whole row into an accidental drag target.
                alignSelf: { xs: "flex-start", md: "stretch" },
                color: "primary.main",
                width: compactHandleSize,
                minWidth: compactHandleSize,
                height: compactHandleSize,
                borderRadius: 1.5,
                backgroundColor: "var(--mui-palette-surface-containerHighest)",
              }}
            >
              <DragIndicator />
            </IconButton>
          </Tooltip>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              // The identity block is kept separate from the fixed action band below so editing
              // text cannot move the visibility and Viewer controls.
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 0.75,
                  maxWidth: "100%",
                  flexWrap: "wrap",
                }}
              >
                <Typography
                  ref={titleEditorRef}
                  component="span"
                  variant="subtitle1"
                  role={isEditing ? "textbox" : undefined}
                  aria-label={isEditing ? "图组标题" : undefined}
                  contentEditable={isEditing && !isPending}
                  data-placeholder="图组标题"
                  suppressContentEditableWarning
                  onInput={isEditing ? syncTitle : undefined}
                  sx={inlineEditTextSx({ active: isEditing, kind: "title" })}
                >
                  {isEditing ? null : group.title}
                </Typography>
                {isEditing ? (
                  <Typography
                    component="span"
                    variant="caption"
                    aria-live="polite"
                    sx={{
                      color: isTitleOverLimit ? "error.main" : "text.secondary",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {draftTitle.length}/{GROUP_TITLE_MAX_LENGTH}
                  </Typography>
                ) : null}
              </Box>
              <Box
                sx={{
                  // This must stay a block-level flex row; inline-flex makes title and description
                  // containers participate in the same text line and collapses the row hierarchy.
                  display: "flex",
                  alignItems: "baseline",
                  gap: 0.75,
                  maxWidth: "100%",
                  flexWrap: "wrap",
                }}
              >
                <Typography
                  ref={descriptionEditorRef}
                  component="span"
                  variant="body2"
                  role={isEditing ? "textbox" : undefined}
                  aria-label={isEditing ? "图组描述" : undefined}
                  contentEditable={isEditing && !isPending}
                  data-placeholder="暂无图组描述。"
                  suppressContentEditableWarning
                  onInput={isEditing ? syncDescription : undefined}
                  noWrap={!isEditing}
                  sx={[
                    {
                      color: "text.secondary",
                    },
                    inlineEditTextSx({
                      active: isEditing,
                      kind: "description",
                    }),
                  ]}
                >
                  {isEditing ? null : group.description || "暂无图组描述。"}
                </Typography>
                {isEditing ? (
                  <Typography
                    component="span"
                    variant="caption"
                    aria-live="polite"
                    sx={{
                      color: isDescriptionOverLimit ? "error.main" : "text.secondary",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {draftDescription.length}/{GROUP_DESCRIPTION_MAX_LENGTH}
                  </Typography>
                ) : null}
              </Box>
            </Box>
          </Box>
        </Stack>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 1.05, sm: 1.2 }}
          useFlexGap
          sx={{
            // A full-width footer gives metadata and commands a stable home while keeping the
            // Group identity visually dominant and preventing edit-mode layout shifts.
            width: "100%",
            px: { xs: 1.5, md: 1.75 },
            py: 0.75,
            borderTop: "1px solid",
            borderColor: "divider",
            backgroundColor: "var(--mui-palette-surface-containerHighest)",
            justifyContent: "space-between",
            alignItems: { xs: "stretch", sm: "center" },
            flexWrap: "wrap",
          }}
        >
          {/* Let metadata and actions share one line as soon as there is enough physical room;
                  a fixed lg cutoff made medium-width workspaces wrap long before they needed to. */}
          <Stack
            direction="row"
            spacing={0.85}
            useFlexGap
            sx={{
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {visibleExtraAssetLabels.map((label) => (
              <Chip key={label} size="small" label={label} sx={metadataChipSx} />
            ))}
            {hiddenExtraAssetLabelCount > 0 ? (
              <Chip size="small" label={`+${hiddenExtraAssetLabelCount}`} sx={metadataChipSx} />
            ) : null}
            <Chip
              size="small"
              icon={<PhotoLibraryOutlined />}
              label={`${group.frameCount} frames`}
              sx={metadataChipSx}
            />
          </Stack>
          <Stack
            direction="row"
            spacing={0.6}
            useFlexGap
            sx={{
              width: { xs: "100%", sm: "auto" },
              flexWrap: "nowrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {/* These controls act on one group only, so they stay visually grouped here instead
                    of competing with workspace-level actions in the page header. */}
            <MagicSegmentedControl
              exclusive
              size="small"
              onPointerDown={stopPointerPropagation}
              onClick={stopClickPropagation}
              sx={{
                minHeight: compactControlHeight,
                "& .MuiToggleButtonGroup-grouped": { minHeight: compactControlHeight },
              }}
              value={group.isPublic ? "public" : "internal"}
              onChange={handleVisibilityChange}
            >
              <ToggleButton
                value="internal"
                disabled={isPending || isEditing}
                sx={visibilityButtonSx}
              >
                <LockOutlined sx={{ mr: 0.55, fontSize: 14.5 }} />
                内部
              </ToggleButton>
              <ToggleButton
                value="public"
                disabled={isPending || isEditing}
                sx={visibilityButtonSx}
              >
                <Public sx={{ mr: 0.55, fontSize: 14.5 }} />
                公开
              </ToggleButton>
            </MagicSegmentedControl>
            <Box
              sx={{
                display: "inline-flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 0.5,
                // The action cluster keeps a stable right edge. Normal mode fills all three
                // positions; edit mode replaces the cluster with save/cancel aligned to the end.
                width: { xs: 128, md: 116 },
                flex: "0 0 auto",
                height: compactControlHeight,
                lineHeight: 0,
              }}
            >
              {isEditing ? (
                <>
                  <Tooltip title="保存图组">
                    <IconButton
                      size="small"
                      color="primary"
                      aria-label="保存图组元数据"
                      disabled={isPending || hasMetadataError}
                      onPointerDown={stopPointerPropagation}
                      onClick={(event) => {
                        stopClickPropagation(event);
                        saveMetadataEdit();
                      }}
                      sx={{ width: compactControlHeight, height: compactControlHeight }}
                    >
                      <Check fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="取消编辑">
                    <IconButton
                      size="small"
                      aria-label="取消编辑图组元数据"
                      disabled={isPending}
                      onPointerDown={stopPointerPropagation}
                      onClick={(event) => {
                        stopClickPropagation(event);
                        cancelMetadataEdit();
                      }}
                      sx={{ width: compactControlHeight, height: compactControlHeight }}
                    >
                      <Close fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              ) : (
                <>
                  <Tooltip title="编辑图组">
                    <IconButton
                      size="small"
                      aria-label="编辑图组"
                      disabled={isPending}
                      onPointerDown={stopPointerPropagation}
                      onClick={(event) => {
                        stopClickPropagation(event);
                        startMetadataEdit();
                      }}
                      sx={{ width: compactControlHeight, height: compactControlHeight }}
                    >
                      <EditOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除图组">
                    <IconButton
                      size="small"
                      color="error"
                      aria-label="删除图组"
                      disabled={isPending}
                      onPointerDown={stopPointerPropagation}
                      onClick={handleDeleteClick}
                      sx={{ width: compactControlHeight, height: compactControlHeight }}
                    >
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="打开 Viewer">
                    <IconButton
                      component={Link}
                      href={`/cases/${caseSlug}/groups/${group.slug}`}
                      aria-label="打开 Viewer"
                      disabled={isPending}
                      onPointerDown={stopPointerPropagation}
                      onClick={handleOpenClick}
                      sx={{ width: compactControlHeight, height: compactControlHeight }}
                    >
                      <ArrowForwardRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
          </Stack>
        </Stack>
      </Paper>
    </ListItem>
  );
}
