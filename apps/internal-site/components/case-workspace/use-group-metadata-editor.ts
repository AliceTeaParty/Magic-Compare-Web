import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CaseWorkspaceData } from "@/lib/server/repositories/content-repository";

type GroupItem = CaseWorkspaceData["groups"][number];

import {
  GROUP_TITLE_MAX_LENGTH,
  GROUP_DESCRIPTION_MAX_LENGTH,
} from "@magic-compare/content-schema";
export {
  GROUP_TITLE_MAX_LENGTH,
  GROUP_DESCRIPTION_MAX_LENGTH,
} from "@magic-compare/content-schema";

function isOverLimit(value: string, maxLength: number) {
  return value.length > maxLength;
}

/**
 * Owns contentEditable draft and caret lifecycle so the sortable row only coordinates DnD and row
 * commands. Draft text remains uncontrolled while editing to avoid moving the caret on input.
 */
export function useGroupMetadataEditor({
  group,
  onUpdateMetadata,
}: {
  group: GroupItem;
  onUpdateMetadata: (
    group: GroupItem,
    metadata: { title: string; description: string },
  ) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(group.title);
  const [draftDescription, setDraftDescription] = useState(group.description);
  const titleEditorRef = useRef<HTMLElement | null>(null);
  const descriptionEditorRef = useRef<HTMLElement | null>(null);
  const editSeedRef = useRef({ title: group.title, description: group.description });
  const isTitleOverLimit = isOverLimit(draftTitle, GROUP_TITLE_MAX_LENGTH);
  const isDescriptionOverLimit = isOverLimit(draftDescription, GROUP_DESCRIPTION_MAX_LENGTH);
  const hasMetadataError = !draftTitle.trim() || isTitleOverLimit || isDescriptionOverLimit;

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

  function startMetadataEdit() {
    editSeedRef.current = { title: group.title, description: group.description };
    setDraftTitle(group.title);
    setDraftDescription(group.description);
    setIsEditing(true);
  }

  function cancelMetadataEdit() {
    setDraftTitle(group.title);
    setDraftDescription(group.description);
    setIsEditing(false);
  }

  /** Validates live DOM text because React intentionally does not own contentEditable rendering. */
  function saveMetadataEdit() {
    const title = titleEditorRef.current?.textContent ?? draftTitle;
    const description = descriptionEditorRef.current?.textContent ?? draftDescription;
    if (
      !title.trim() ||
      isOverLimit(title, GROUP_TITLE_MAX_LENGTH) ||
      isOverLimit(description, GROUP_DESCRIPTION_MAX_LENGTH)
    ) {
      return;
    }

    void onUpdateMetadata(group, { title, description });
    setIsEditing(false);
  }

  function syncTitle() {
    setDraftTitle(titleEditorRef.current?.textContent ?? "");
  }

  function syncDescription() {
    setDraftDescription(descriptionEditorRef.current?.textContent ?? "");
  }

  return {
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
  };
}
