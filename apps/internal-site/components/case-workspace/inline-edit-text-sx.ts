import type { SxProps, Theme } from "@mui/material";

type InlineEditTextKind = "title" | "description" | "summary";

/**
 * Builds the shared contentEditable text affordance used by Case summaries and Group metadata.
 * The underline is painted inside pre-reserved padding so entering edit mode never changes text
 * metrics or pushes the rows below it.
 */
export function inlineEditTextSx({
  active,
  kind,
}: {
  active: boolean;
  kind: InlineEditTextKind;
}): SxProps<Theme> {
  const baseSx = {
    display: "block",
    maxWidth: "100%",
    outline: 0,
    pb: "2px",
    position: "relative",
    whiteSpace: "pre-wrap",
    width: "fit-content",
    "&::after": {
      position: "absolute",
      right: 0,
      bottom: 0,
      left: 0,
      height: "1px",
      content: '""',
      backgroundColor: active ? "currentColor" : "transparent",
    },
    "&:empty::before": {
      color: "text.disabled",
      content: "attr(data-placeholder)",
    },
  } satisfies SxProps<Theme>;

  if (kind === "title") {
    return {
      ...baseSx,
      cursor: active ? "text" : "inherit",
      fontWeight: 600,
      lineHeight: 1.15,
      minWidth: "4ch",
    };
  }

  if (kind === "summary") {
    return {
      ...baseSx,
      cursor: active ? "text" : "inherit",
      lineHeight: 1.65,
      minWidth: "8ch",
    };
  }

  return {
    ...baseSx,
    cursor: active ? "text" : "inherit",
    lineHeight: 1.6,
    minHeight: "1.6em",
    minWidth: "6ch",
    mt: 0.6,
  };
}
