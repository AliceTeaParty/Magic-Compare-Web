import {
  Check,
  Close,
  DragIndicator,
  EditOutlined,
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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import { inlineEditTextSx } from "./inline-edit-text-sx";

type GroupItem = CaseWorkspaceData["groups"][number];
const GROUP_TITLE_MAX_LENGTH = 16;
const GROUP_DESCRIPTION_MAX_LENGTH = 40;

function limitText(value: string, maxLength: number) {
  return value.slice(0, maxLength);
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
}: {
  group: GroupItem;
  caseSlug: string;
  isPending: boolean;
  onUpdateMetadata: (
    group: GroupItem,
    metadata: { title: string; description: string },
  ) => Promise<void>;
  onToggleVisibility: (group: GroupItem) => void;
}) {
  // Workspace rows do a lot of work on mobile, so drag, visibility, and open controls share a
  // single 40px+ baseline instead of the older mixed 32/36px targets.
  const compactControlHeight = { xs: 42, md: 40 };
  const compactHandleSize = { xs: 42, md: 40 };
  const visibilityButtonHeight = { xs: 36, md: 34 };
  const visibilityButtonSx = {
    minHeight: visibilityButtonHeight,
    px: "8px",
    py: 0,
    border: "0 !important",
    boxShadow: "none",
    color: "text.secondary",
    fontSize: "0.84rem",
    backgroundColor: "transparent",
    "&:hover": {
      backgroundColor: "rgba(255,255,255,0.055)",
    },
    "&.Mui-selected": {
      color: "text.primary",
      backgroundColor: "rgba(232, 198, 246, 0.15)",
      boxShadow: "inset 0 0 0 1px rgba(232, 198, 246, 0.34)",
    },
    "&.Mui-selected:hover": {
      backgroundColor: "rgba(232, 198, 246, 0.18)",
    },
    "&.Mui-disabled": {
      color: "text.secondary",
      opacity: 0.6,
    },
    "&.Mui-selected.Mui-disabled": {
      color: "text.primary",
      backgroundColor: "rgba(232, 198, 246, 0.13)",
      boxShadow: "inset 0 0 0 1px rgba(232, 198, 246, 0.28)",
      opacity: 1,
    },
  };
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(
    limitText(group.title, GROUP_TITLE_MAX_LENGTH),
  );
  const [draftDescription, setDraftDescription] = useState(
    limitText(group.description, GROUP_DESCRIPTION_MAX_LENGTH),
  );
  const titleEditorRef = useRef<HTMLElement | null>(null);
  const descriptionEditorRef = useRef<HTMLElement | null>(null);
  const editSeedRef = useRef({
    title: limitText(group.title, GROUP_TITLE_MAX_LENGTH),
    description: limitText(group.description, GROUP_DESCRIPTION_MAX_LENGTH),
  });
  const titleError = draftTitle.trim() ? null : "标题不能为空。";
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: group.id });

  useEffect(() => {
    if (!isEditing) {
      setDraftTitle(limitText(group.title, GROUP_TITLE_MAX_LENGTH));
      setDraftDescription(
        limitText(group.description, GROUP_DESCRIPTION_MAX_LENGTH),
      );
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

  /**
   * Rehydrates drafts from the current row before editing so an earlier cancelled or failed save
   * cannot leak stale text into the inline editor.
   */
  function startMetadataEdit() {
    const nextTitle = limitText(group.title, GROUP_TITLE_MAX_LENGTH);
    const nextDescription = limitText(
      group.description,
      GROUP_DESCRIPTION_MAX_LENGTH,
    );
    editSeedRef.current = {
      title: nextTitle,
      description: nextDescription,
    };
    setDraftTitle(nextTitle);
    setDraftDescription(nextDescription);
    setIsEditing(true);
  }

  /**
   * Cancelling mirrors startMetadataEdit for the same reason: the row should return to the last
   * committed metadata snapshot, not whatever contentEditable currently contains.
   */
  function cancelMetadataEdit() {
    setDraftTitle(limitText(group.title, GROUP_TITLE_MAX_LENGTH));
    setDraftDescription(
      limitText(group.description, GROUP_DESCRIPTION_MAX_LENGTH),
    );
    setIsEditing(false);
  }

  /**
   * Group title is part of the row's primary identity, so client validation mirrors the API rule
   * before scheduling an optimistic metadata save.
   */
  function saveMetadataEdit() {
    if (titleError) {
      return;
    }

    void onUpdateMetadata(group, {
      title: limitText(
        titleEditorRef.current?.textContent ?? draftTitle,
        GROUP_TITLE_MAX_LENGTH,
      ),
      description: limitText(
        descriptionEditorRef.current?.textContent ?? draftDescription,
        GROUP_DESCRIPTION_MAX_LENGTH,
      ),
    });
    setIsEditing(false);
  }

  function handleOpenClick(event: ReactMouseEvent<HTMLElement>) {
    stopClickPropagation(event);
    if (isPending || isEditing) {
      event.preventDefault();
    }
  }

  /**
   * Keeps the visible editor text and React draft state in lockstep while enforcing compact row
   * limits; contentEditable does not provide native maxLength semantics.
   */
  function syncEditableText(
    editor: HTMLElement | null,
    maxLength: number,
    updateDraft: (value: string) => void,
  ) {
    if (!editor) {
      return;
    }

    const text = editor.textContent ?? "";
    const limitedText = limitText(text, maxLength);

    if (text !== limitedText) {
      editor.textContent = limitedText;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    updateDraft(limitedText);
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
          <Tooltip title="拖动调整此 Case 内的顺序。">
            <IconButton
              {...attributes}
              {...listeners}
              disabled={isPending || isEditing}
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
                    ? () =>
                        syncEditableText(
                          titleEditorRef.current,
                          GROUP_TITLE_MAX_LENGTH,
                          setDraftTitle,
                        )
                    : undefined
                }
                sx={inlineEditTextSx({ active: isEditing, kind: "title" })}
              >
                {isEditing ? null : group.title}
              </Typography>
              <Typography
                ref={descriptionEditorRef}
                component="span"
                variant="body2"
                role={isEditing ? "textbox" : undefined}
                aria-label={isEditing ? "Group 描述" : undefined}
                color="text.secondary"
                contentEditable={isEditing && !isPending}
                data-placeholder="暂无 Group 描述。"
                suppressContentEditableWarning
                onInput={
                  isEditing
                    ? () =>
                        syncEditableText(
                          descriptionEditorRef.current,
                          GROUP_DESCRIPTION_MAX_LENGTH,
                          setDraftDescription,
                        )
                    : undefined
                }
                noWrap={!isEditing}
                sx={inlineEditTextSx({
                  active: isEditing,
                  kind: "description",
                })}
              >
                {isEditing ? null : group.description || "暂无 Group 描述。"}
              </Typography>
            </Box>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={{ xs: 1.05, sm: 1.2 }}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", sm: "center" }}
              flexWrap="wrap"
              useFlexGap
            >
              {/* Let metadata and actions share one line as soon as there is enough physical room;
                  a fixed lg cutoff made medium-width workspaces wrap long before they needed to. */}
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
                    alignItems: "center",
                    gap: 0.15,
                    minHeight: compactControlHeight,
                    overflow: "visible",
                    px: 0.25,
                    py: 0.25,
                    borderRadius: 999,
                    border: "1px solid",
                    borderColor: "divider",
                    backgroundColor: "rgba(255,255,255,0.035)",
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
                    Internal
                  </ToggleButton>
                  <ToggleButton
                    value="public"
                    disabled={isPending || isEditing}
                    sx={visibilityButtonSx}
                  >
                    <Public sx={{ mr: 0.55, fontSize: 14.5 }} />
                    Public
                  </ToggleButton>
                </ToggleButtonGroup>
                <Box
                  sx={{
                    display: "inline-flex",
                    justifyContent: "flex-start",
                    alignItems: "center",
                    minWidth: { xs: 84, md: 80 },
                    height: compactControlHeight,
                    lineHeight: 0,
                  }}
                >
                  {isEditing ? (
                    <>
                    <IconButton
                      size="small"
                      aria-label="保存 Group 元数据"
                      disabled={isPending || Boolean(titleError)}
                      onPointerDown={stopPointerPropagation}
                      onClick={(event) => {
                        stopClickPropagation(event);
                        saveMetadataEdit();
                      }}
                      sx={{
                        width: compactControlHeight,
                        height: compactControlHeight,
                        borderRadius: 999,
                      }}
                    >
                      <Check fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="取消编辑 Group 元数据"
                      disabled={isPending}
                      onPointerDown={stopPointerPropagation}
                      onClick={(event) => {
                        stopClickPropagation(event);
                        cancelMetadataEdit();
                      }}
                      sx={{
                        width: compactControlHeight,
                        height: compactControlHeight,
                        borderRadius: 999,
                      }}
                    >
                      <Close fontSize="small" />
                    </IconButton>
                    </>
                  ) : (
                    <Button
                      variant="text"
                      size="small"
                      startIcon={<EditOutlined />}
                      disabled={isPending}
                      onPointerDown={stopPointerPropagation}
                      onClick={(event) => {
                        stopClickPropagation(event);
                        startMetadataEdit();
                      }}
                      sx={{
                        minHeight: compactControlHeight,
                        minWidth: { xs: 84, md: 80 },
                        px: 1.15,
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </Box>
                <Button
                  component={Link}
                  href={`/cases/${caseSlug}/groups/${group.slug}`}
                  variant="text"
                  size="small"
                  endIcon={<OpenInNew />}
                  disabled={isPending || isEditing}
                  aria-disabled={isPending || isEditing}
                  onPointerDown={stopPointerPropagation}
                  onClick={handleOpenClick}
                  sx={{ minHeight: compactControlHeight, px: 1.15 }}
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
