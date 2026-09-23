import { useEffect, useState } from "react";
import { Check, Close, EditOutlined } from "@mui/icons-material";
import { Box, IconButton, Typography } from "@mui/material";
import { webUploadSizes, webUploadSurfaces } from "./web-upload-design";
import type { PlanView, UploadPlanImageColumn } from "./web-upload-view-model";

function EditableColumnHeader({
  canEdit,
  label,
  onRename,
}: {
  canEdit: boolean;
  label: string;
  onRename: (nextLabel: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  useEffect(() => {
    if (!editing) {
      setDraft(label);
    }
  }, [editing, label]);

  function save() {
    const nextLabel = draft.trim();
    if (nextLabel && nextLabel !== label) {
      onRename(nextLabel);
    }
    setEditing(false);
  }

  if (!canEdit) {
    return <>{label}</>;
  }

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.35, minWidth: 0 }}>
      {editing ? (
        <>
          <Box
            component="input"
            value={draft}
            aria-label={`编辑 ${label} 列名`}
            onChange={(event) => setDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setEditing(false);
              }
            }}
            sx={{
              width: "9ch",
              minWidth: 0,
              border: 0,
              borderBottom: "1px solid currentColor",
              outline: 0,
              p: 0,
              color: "inherit",
              background: "transparent",
              font: "inherit",
            }}
          />
          <IconButton
            aria-label="保存列名"
            size="small"
            onClick={save}
            sx={{ width: webUploadSizes.inlineIconButton, height: webUploadSizes.inlineIconButton }}
          >
            <Check sx={{ fontSize: 15 }} />
          </IconButton>
          <IconButton
            aria-label="取消编辑列名"
            size="small"
            onClick={() => setEditing(false)}
            sx={{ width: webUploadSizes.inlineIconButton, height: webUploadSizes.inlineIconButton }}
          >
            <Close sx={{ fontSize: 15 }} />
          </IconButton>
        </>
      ) : (
        <>
          <Typography component="span" variant="inherit" noWrap sx={{ minWidth: 0 }}>
            {label}
          </Typography>
          <IconButton
            aria-label={`编辑 ${label} 列名`}
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              setEditing(true);
            }}
            sx={{
              width: webUploadSizes.inlineIconButton,
              height: webUploadSizes.inlineIconButton,
              opacity: 0.72,
              "&:hover": { opacity: 1 },
            }}
          >
            <EditOutlined sx={{ fontSize: 14 }} />
          </IconButton>
        </>
      )}
    </Box>
  );
}

/** Keeps the sticky table geometry and editable labels aligned with sortable row columns. */
export function PairingTableHeader({
  alternateColumns,
  canEdit,
  desktopGridColumns,
  onRenameColumn,
  planView,
}: {
  alternateColumns: string[];
  canEdit: boolean;
  desktopGridColumns: string;
  onRenameColumn: (column: UploadPlanImageColumn, nextLabel: string) => void;
  planView: PlanView;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "40px 42px minmax(0, 1fr) 24px 40px",
          md: desktopGridColumns,
        },
        gap: { xs: 0.75, md: 1 },
        alignItems: "center",
        px: { xs: 0.75, md: 1.1 },
        py: 0.85,
        position: "sticky",
        top: 0,
        zIndex: 1,
        color: "text.secondary",
        backgroundColor: webUploadSurfaces.stickyHeader,
        borderBottom: "1px solid",
        borderColor: "divider",
        fontSize: 13,
      }}
    >
      <span />
      <span>序号</span>
      <span>Frame</span>
      <Box component="span" sx={{ display: { xs: "none", md: "block" } }}>
        <EditableColumnHeader
          canEdit={canEdit}
          label={planView.beforeLabel}
          onRename={(nextLabel) => onRenameColumn({ kind: "before" }, nextLabel)}
        />
      </Box>
      <Box component="span" sx={{ display: { xs: "none", md: "block" } }}>
        <EditableColumnHeader
          canEdit={canEdit}
          label={planView.afterLabel}
          onRename={(nextLabel) => onRenameColumn({ kind: "after" }, nextLabel)}
        />
      </Box>
      {alternateColumns.map((label) => (
        <Box key={label} component="span" sx={{ display: { xs: "none", md: "block" } }}>
          <EditableColumnHeader
            canEdit={canEdit}
            label={label}
            onRename={(nextLabel) => onRenameColumn({ kind: "misc", label }, nextLabel)}
          />
        </Box>
      ))}
      <Box component="span" sx={{ display: "block" }}>
        状态
      </Box>
      <span />
    </Box>
  );
}
