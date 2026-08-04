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
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import { inlineEditTextSx } from "./inline-edit-text-sx";

type GroupItem = CaseWorkspaceData["groups"][number];
const GROUP_TITLE_MAX_LENGTH = 16;
const GROUP_DESCRIPTION_MAX_LENGTH = 40;
const metadataChipSx = {
  height: 30,
  border: 0,
  color: "text.secondary",
  backgroundColor: "var(--mui-palette-surface-containerHigh)",
  "& .MuiChip-icon": { ml: 1, color: "inherit", fontSize: 17 },
  "& .MuiChip-label": { px: 1.15 },
} as const;

/**
 * Lets the editor show temporary overflow while keeping save validation strict, which is easier to
 * correct than silently rejecting keystrokes in a contentEditable field.
 */
function isOverLimit(value: string, maxLength: number) {
  return value.length > maxLength;
}

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
    border: "0 !important",
    boxShadow: "none",
    color: "text.secondary",
    fontSize: "0.8125rem",
    backgroundColor: "transparent",
    "&:hover": { backgroundColor: "action.hover" },
    "&.Mui-selected": {
      color: "primary.onContainer",
      backgroundColor: "primary.light",
    },
    "&.Mui-selected:hover": {
      backgroundColor: "color-mix(in srgb, currentColor 8%, var(--mui-palette-primary-light))",
    },
    "&.Mui-disabled": {
      color: "text.secondary",
      opacity: 0.6,
    },
    "&.Mui-selected.Mui-disabled": {
      color: "primary.onContainer",
      backgroundColor: "primary.light",
      opacity: 1,
    },
  };
  const [isEditing, setIsEditing] = useState(false);
  // Existing metadata can predate current limits. Preserve it in the editor so opening and saving
  // cannot silently truncate server data; the counters and save validation surface the overflow.
  const [draftTitle, setDraftTitle] = useState(group.title);
  const [draftDescription, setDraftDescription] = useState(group.description);
  const titleEditorRef = useRef<HTMLElement | null>(null);
  const descriptionEditorRef = useRef<HTMLElement | null>(null);
  const editSeedRef = useRef({
    title: group.title,
    description: group.description,
  });
  const isTitleOverLimit = isOverLimit(draftTitle, GROUP_TITLE_MAX_LENGTH);
  const isDescriptionOverLimit = isOverLimit(draftDescription, GROUP_DESCRIPTION_MAX_LENGTH);
  const titleError = draftTitle.trim() ? null : "标题不能为空。";
  const hasMetadataError = Boolean(titleError) || isTitleOverLimit || isDescriptionOverLimit;
  const visibleExtraAssetLabels = group.extraAssetLabels.slice(0, 3);
  const hiddenExtraAssetLabelCount = group.extraAssetLabels.length - visibleExtraAssetLabels.length;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: group.id,
  });

  useEffect(() => {
    if (!isEditing) {
      setDraftTitle(group.title);
      setDraftDescription(group.description);
    }
  }, [group.description, group.title, isEditing]);

  useLayoutEffect(() => {
    if (!isEditing) {
      return;
    }

    const titleEditor = titleEditorRef.current;
    const descriptionEditor = descriptionEditorRef.current;
    if (!titleEditor || !descriptionEditor) {
      return;
    }

    // Keep React out of the live contentEditable text path; otherwise every draft update can
    // recreate text nodes and move the caret back to the start.
    titleEditor.textContent = editSeedRef.current.title;
    descriptionEditor.textContent = editSeedRef.current.description;
    titleEditor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(titleEditor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [isEditing]);

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

  /**
   * Rehydrates drafts from the current row before editing so an earlier cancelled or failed save
   * cannot leak stale text into the inline editor.
   */
  function startMetadataEdit() {
    editSeedRef.current = {
      title: group.title,
      description: group.description,
    };
    setDraftTitle(group.title);
    setDraftDescription(group.description);
    setIsEditing(true);
  }

  /**
   * Cancelling mirrors startMetadataEdit for the same reason: the row should return to the last
   * committed metadata snapshot, not whatever contentEditable currently contains.
   */
  function cancelMetadataEdit() {
    setDraftTitle(group.title);
    setDraftDescription(group.description);
    setIsEditing(false);
  }

  /**
   * Group title is part of the row's primary identity, so client validation mirrors the API rule
   * before scheduling an optimistic metadata save.
   */
  function saveMetadataEdit() {
    const titleText = titleEditorRef.current?.textContent ?? draftTitle;
    const descriptionText = descriptionEditorRef.current?.textContent ?? draftDescription;

    if (
      !titleText.trim() ||
      isOverLimit(titleText, GROUP_TITLE_MAX_LENGTH) ||
      isOverLimit(descriptionText, GROUP_DESCRIPTION_MAX_LENGTH)
    ) {
      return;
    }

    void onUpdateMetadata(group, {
      title: titleText,
      description: descriptionText,
    });
    setIsEditing(false);
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

  /**
   * Keeps the visible editor text and React draft state in lockstep without trimming so the
   * character counter can guide users back under the limit instead of blocking input.
   */
  function syncEditableText(editor: HTMLElement | null, updateDraft: (value: string) => void) {
    if (!editor) {
      return;
    }

    updateDraft(editor.textContent ?? "");
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
          <Tooltip title="拖动调整此 Case 内的顺序。">
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
                  aria-label={isEditing ? "Group 标题" : undefined}
                  contentEditable={isEditing && !isPending}
                  data-placeholder="Group 标题"
                  suppressContentEditableWarning
                  onInput={
                    isEditing
                      ? () => syncEditableText(titleEditorRef.current, setDraftTitle)
                      : undefined
                  }
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
                  aria-label={isEditing ? "Group 描述" : undefined}
                  contentEditable={isEditing && !isPending}
                  data-placeholder="暂无 Group 描述。"
                  suppressContentEditableWarning
                  onInput={
                    isEditing
                      ? () => syncEditableText(descriptionEditorRef.current, setDraftDescription)
                      : undefined
                  }
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
                  {isEditing ? null : group.description || "暂无 Group 描述。"}
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
            <ToggleButtonGroup
              exclusive
              size="small"
              onPointerDown={stopPointerPropagation}
              onClick={stopClickPropagation}
              sx={{
                alignItems: "center",
                gap: 0,
                minHeight: compactControlHeight,
                overflow: "hidden",
                borderRadius: 999,
                backgroundColor: "var(--mui-palette-surface-containerHigh)",
                "& .MuiToggleButtonGroup-grouped": {
                  m: 0,
                  border: 0,
                  borderRadius: 999,
                  "&:not(:first-of-type)": {
                    borderLeft: 0,
                    ml: 0,
                  },
                },
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
            </ToggleButtonGroup>
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
                  <Tooltip title="保存 Group">
                    <IconButton
                      size="small"
                      color="primary"
                      aria-label="保存 Group 元数据"
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
                      aria-label="取消编辑 Group 元数据"
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
                  <Tooltip title="编辑 Group">
                    <IconButton
                      size="small"
                      aria-label="编辑 Group"
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
                  <Tooltip title="删除 Group">
                    <IconButton
                      size="small"
                      color="error"
                      aria-label="删除 Group"
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
