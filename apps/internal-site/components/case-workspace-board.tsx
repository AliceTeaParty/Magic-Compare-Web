"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import {
  ArrowBack,
  Check,
  Close,
  CloudUpload,
  EditOutlined,
  UploadFile,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  IconButton,
  List,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";
import { inlineEditTextSx } from "./case-workspace/inline-edit-text-sx";
import { WorkspaceNotifications } from "./case-workspace/notifications";
import { SortableGroupRow } from "./case-workspace/sortable-group-row";
import { useCaseWorkspaceActions } from "./case-workspace/use-case-workspace-actions";
import { useWorkspaceNotifications } from "./case-workspace/use-workspace-notifications";

const CASE_SUMMARY_MAX_LENGTH = 160;

function limitCaseSummary(value: string) {
  return value.slice(0, CASE_SUMMARY_MAX_LENGTH);
}

/**
 * Keeps the over-limit check explicit because inline editing now permits temporary overflow so
 * users can revise long text instead of being blocked at the exact character boundary.
 */
function isOverLimit(value: string, maxLength: number) {
  return value.length > maxLength;
}

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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [groups, setGroups] = useState(data.groups);
  const [caseSummary, setCaseSummary] = useState(limitCaseSummary(data.summary));
  const [caseSummaryDraft, setCaseSummaryDraft] = useState(limitCaseSummary(data.summary));
  const [lastServerSummary, setLastServerSummary] = useState(limitCaseSummary(data.summary));
  const [isEditingCaseSummary, setIsEditingCaseSummary] = useState(false);
  const isCaseSummaryOverLimit = isOverLimit(caseSummaryDraft, CASE_SUMMARY_MAX_LENGTH);
  const caseSummaryEditorRef = useRef<HTMLElement | null>(null);
  const caseSummaryEditSeedRef = useRef(limitCaseSummary(data.summary));
  const [isPending, startTransition] = useTransition();
  const workspaceNotifications = useWorkspaceNotifications();
  const { dismissNotification, notifications, pushNotification } = workspaceNotifications;
  const {
    publicGroupCount,
    isDeployingPublicSite,
    toggleGroupVisibility,
    deployPublicSite,
    reorderCaseGroups,
    updateCaseSummary,
    updateGroupMetadata,
    deleteGroup,
  } = useCaseWorkspaceActions({
    caseSummary,
    data,
    groups,
    setCaseSummary,
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
    const nextSummary = limitCaseSummary(data.summary);

    if (nextSummary === lastServerSummary) {
      return;
    }

    setLastServerSummary(nextSummary);
    setCaseSummary(nextSummary);
    if (!isEditingCaseSummary) {
      setCaseSummaryDraft(nextSummary);
    }
  }, [data.summary, isEditingCaseSummary, lastServerSummary]);

  useLayoutEffect(() => {
    if (!isEditingCaseSummary) {
      return;
    }

    const editor = caseSummaryEditorRef.current;
    if (!editor) {
      return;
    }

    // React must not control contentEditable children during typing; seed the DOM once instead.
    editor.textContent = caseSummaryEditSeedRef.current;
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [isEditingCaseSummary]);

  useEffect(() => {
    if (publicGroupCount === 0) {
      pushNotification(
        "This case has no public groups yet. Use the per-group internal/public toggle below before deploying.",
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

  /**
   * Uses client-side navigation back to the catalog so the workspace keeps the app-shell feel
   * instead of doing a full document reload for a very common "back to list" action.
   */
  function navigateToCatalog() {
    router.push("/");
  }

  /**
   * Case summary edits stay local after the API save returns; refreshing the full route would
   * replay the workspace entrance motion and make unrelated controls flash.
   */
  function saveCaseSummary() {
    const nextSummary = caseSummaryEditorRef.current?.textContent ?? caseSummaryDraft;
    if (isOverLimit(nextSummary, CASE_SUMMARY_MAX_LENGTH)) {
      return;
    }

    void updateCaseSummary(nextSummary);
    setIsEditingCaseSummary(false);
  }

  /**
   * Restores the draft from the last committed summary so cancel never leaves contentEditable DOM
   * text ahead of the actual workspace state.
   */
  function cancelCaseSummaryEdit() {
    setCaseSummaryDraft(caseSummary);
    setIsEditingCaseSummary(false);
  }

  /**
   * Mirrors contentEditable text into React state without trimming so users can see how far they
   * overshot the product limit, then delete or rewrite instead of being blocked mid-thought.
   */
  function handleCaseSummaryInput() {
    const editor = caseSummaryEditorRef.current;

    if (!editor) {
      return;
    }

    setCaseSummaryDraft(editor.textContent ?? "");
  }

  return (
    <Stack spacing={{ xs: 2.6, md: 3.3 }}>
      <Box
        component={motion.div}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <Stack spacing={1.9} sx={{ width: "100%" }}>
          <Box
            sx={{
              display: "grid",
              gap: { xs: 2.1, xl: 2.6 },
              alignItems: "start",
              // Giving header content and page actions their own columns prevents deploy/navigation
              // controls from visually blending into the case summary and status chips.
              gridTemplateColumns: {
                xs: "1fr",
                xl: "minmax(0, 1.3fr) minmax(280px, 0.72fr)",
              },
              pb: { xs: 2.8, md: 3.2 },
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Stack spacing={1.15} sx={{ minWidth: 0, pr: { xl: 2.6 } }}>
              <Typography variant="h2" component="h1" sx={{ lineHeight: 1, textWrap: "balance" }}>
                {data.title}
              </Typography>
              <Box
                sx={{
                  alignItems: "center",
                  display: "inline-flex",
                  flexWrap: "wrap",
                  gap: 0.65,
                  maxWidth: "min(860px, 100%)",
                  color: "text.secondary",
                }}
              >
                <Typography
                  ref={caseSummaryEditorRef}
                  component="span"
                  variant="body1"
                  role={isEditingCaseSummary ? "textbox" : undefined}
                  aria-label={isEditingCaseSummary ? "Case 描述" : undefined}
                  aria-multiline={isEditingCaseSummary ? "true" : undefined}
                  contentEditable={isEditingCaseSummary && !isPending}
                  data-placeholder="暂无 Case 描述。"
                  suppressContentEditableWarning
                  onInput={isEditingCaseSummary ? handleCaseSummaryInput : undefined}
                  sx={inlineEditTextSx({
                    active: isEditingCaseSummary,
                    kind: "summary",
                  })}
                >
                  {isEditingCaseSummary ? null : caseSummary || "暂无 Case 描述。"}
                </Typography>
                {isEditingCaseSummary ? (
                  <Typography
                    component="span"
                    variant="caption"
                    aria-live="polite"
                    sx={{
                      color: isCaseSummaryOverLimit ? "error.main" : "text.secondary",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                      minWidth: 54,
                    }}
                  >
                    {caseSummaryDraft.length}/{CASE_SUMMARY_MAX_LENGTH}
                  </Typography>
                ) : null}
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: 0,
                    color: "text.primary",
                    // A fixed action slot prevents Edit -> save/cancel icon swaps from nudging
                    // the summary, status chips, or page actions during rapid editing.
                    width: 64,
                    height: 32,
                    lineHeight: 0,
                  }}
                >
                  {isEditingCaseSummary ? (
                    <>
                      <IconButton
                        size="small"
                        aria-label="保存描述"
                        disabled={isPending || isCaseSummaryOverLimit}
                        onClick={saveCaseSummary}
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          border: 0,
                          backgroundColor: "transparent",
                        }}
                      >
                        <Check fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label="取消编辑描述"
                        disabled={isPending}
                        onClick={cancelCaseSummaryEdit}
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          border: 0,
                          backgroundColor: "transparent",
                        }}
                      >
                        <Close fontSize="small" />
                      </IconButton>
                    </>
                  ) : (
                    <IconButton
                      aria-label="编辑描述"
                      size="small"
                      disabled={isPending}
                      onClick={() => {
                        const nextDraft = limitCaseSummary(caseSummary);
                        caseSummaryEditSeedRef.current = nextDraft;
                        setCaseSummaryDraft(nextDraft);
                        setIsEditingCaseSummary(true);
                      }}
                      sx={{
                        width: 32,
                        height: 32,
                        verticalAlign: "middle",
                      }}
                    >
                      <EditOutlined fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              </Box>
              <Stack direction="row" spacing={0.9} flexWrap="wrap" useFlexGap sx={{ pt: 0.35 }}>
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
              spacing={1.15}
              sx={{
                justifySelf: "end",
                "& .MuiButton-root": {
                  minHeight: 42,
                  px: 2.1,
                },
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                justifyContent="flex-end"
                flexWrap="wrap"
                useFlexGap
                sx={{
                  // Match the lighter nested treatment used by the group visibility control so
                  // page-level actions feel embedded in the header instead of wrapped by a card.
                  // The container stays width-fit so the two actions hug each other instead of
                  // stretching across the whole header like a secondary content column.
                  width: "fit-content",
                  maxWidth: "100%",
                  alignSelf: "flex-end",
                  p: 0.45,
                  borderRadius: 999,
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: "rgba(255,255,255,0.028)",
                }}
              >
                <Button
                  variant="text"
                  startIcon={<ArrowBack />}
                  onClick={navigateToCatalog}
                  sx={{
                    color: "text.secondary",
                    px: 1.2,
                    borderRadius: 999,
                    backgroundColor: "transparent",
                    border: "1px solid transparent",
                    "&:hover": {
                      color: "text.primary",
                      borderColor: "rgba(232, 198, 246, 0.26)",
                      backgroundColor: "rgba(255,255,255,0.04)",
                    },
                  }}
                >
                  Back to catalog
                </Button>
                <Button
                  component={Link}
                  href={`/upload?case=${encodeURIComponent(data.slug)}`}
                  variant="outlined"
                  startIcon={<UploadFile />}
                  disabled={isPending || isDeployingPublicSite}
                  sx={{
                    borderColor: "transparent",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    "&:hover": {
                      borderColor: "rgba(232, 198, 246, 0.26)",
                    },
                  }}
                >
                  上传对比
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
                      variant="contained"
                      startIcon={<CloudUpload />}
                      disabled={
                        isPending ||
                        isDeployingPublicSite ||
                        !canDeployPublicSite ||
                        groups.length === 0
                      }
                      onClick={deployPublicSite}
                    >
                      Deploy Pages
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
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
            // The board padding and row gap were both loosened so adjacent groups read as separate
            // review units instead of one dense control slab.
            p: { xs: 2.1, md: 2.7 },
            borderRadius: 3.5,
            border: "1px solid",
            borderColor: "divider",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
          }}
        >
          <Stack spacing={1.85}>
            <Stack spacing={0.7}>
              <Typography variant="h6">Groups</Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ maxWidth: 720, lineHeight: 1.72 }}
              >
                拖动调整此 Case 内的顺序。
              </Typography>
            </Stack>
            <DndContext
              // dnd-kit derives aria-describedby ids from this value; keeping it stable avoids
              // Next.js hydration mismatches after SSR or repeated dev hot reloads.
              id={`case-workspace-${data.slug}-groups`}
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
                <List
                  sx={{
                    // Slightly larger inter-row spacing keeps each group row from collapsing into
                    // the next once descriptions and actions start wrapping on smaller screens.
                    display: "grid",
                    gap: { xs: 1.15, md: 1.3 },
                  }}
                >
                  {groups.map((group) => (
                    <SortableGroupRow
                      key={group.id}
                      group={group}
                      caseSlug={data.slug}
                      isPending={isPending}
                      onUpdateMetadata={updateGroupMetadata}
                      onToggleVisibility={toggleGroupVisibility}
                      onDelete={deleteGroup}
                    />
                  ))}
                </List>
              </SortableContext>
            </DndContext>
          </Stack>
        </Paper>
      </Box>

      <WorkspaceNotifications notifications={notifications} onDismiss={dismissNotification} />
    </Stack>
  );
}
