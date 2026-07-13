export interface UploadFilenameParts {
  prefix: string;
  frame: string;
  variant: string | null;
}

const FILENAME_SEPARATOR_RE = String.raw`(?:\s+-\s+|[_\-.])`;
const UPLOAD_FILENAME_RE = new RegExp(
  String.raw`^(?<prefix>.+?)${FILENAME_SEPARATOR_RE}(?<frame>\d+)(?:${FILENAME_SEPARATOR_RE}(?<variant>[^_\-.]+?))?$`,
);

/**
 * Parses the shared flat upload filename shape so scanner grouping and UI labels do not drift.
 * The spaced-dash form is intentionally strict (`name - 001`) to avoid treating prose hyphens as separators.
 */
export function parseUploadFilenameStem(stem: string): UploadFilenameParts | null {
  const match = UPLOAD_FILENAME_RE.exec(stem.trim());
  if (!match?.groups) {
    return null;
  }

  const prefix = match.groups.prefix.trim();
  const frame = match.groups.frame.trim();
  const variant = match.groups.variant?.trim() ?? null;
  if (!prefix || !frame || variant === "") {
    return null;
  }

  return {
    prefix,
    frame,
    variant,
  };
}
