import type {
  WebUploadFramePlan,
  WebUploadIssue,
  WebUploadPlan,
} from "./web-upload-types";

export interface FramePreviewRow {
  frameId: string;
  order: number;
  title: string;
  beforePath: string;
  afterPath: string;
  alternateAfter: Array<{ label: string; path: string }>;
  heatmapPath: string | null;
  miscCount: number;
  issueCount: number;
  hasError: boolean;
  hasWarning: boolean;
}

export interface PlanView {
  sourceRootName: string;
  suggestedGroupSlug: string;
  suggestedGroupTitle: string;
  beforeLabel: string;
  afterLabel: string;
  heatmapReferenceLabel: string;
  heatmapReferenceOptions: string[];
  frames: FramePreviewRow[];
  healthyPairCount: number;
  ignoredCount: number;
  warningCount: number;
  errorCount: number;
  issues: Array<{ severity: "warning" | "error"; message: string; path: string }>;
}

export type UploadPlanImageColumn =
  | { kind: "before" }
  | { kind: "after" }
  | { kind: "misc"; label: string };

function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function frameIdForFrame(frame: WebUploadFramePlan) {
  return `frame-${stableHash(
    `${frame.title}|${frame.before.source.relativePath}|${frame.after.source.relativePath}`,
  )}`;
}

export function compactUploadFilename(path: string, maxLength = 38) {
  const fileName = path.split("/").filter(Boolean).at(-1) ?? path;
  if (fileName.length <= maxLength) {
    return fileName;
  }

  const ellipsis = "…";
  const remaining = Math.max(2, maxLength - ellipsis.length);
  const headLength = Math.ceil(remaining / 2);
  const tailLength = Math.floor(remaining / 2);
  return `${fileName.slice(0, headLength)}${ellipsis}${fileName.slice(-tailLength)}`;
}

function stemFromPath(path: string) {
  const fileName = path.split("/").filter(Boolean).at(-1) ?? path;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
}

function fullFrameTitleFromSourcePath(path: string) {
  const pathStem = stemFromPath(path);
  const match = /^(?<prefix>.+?)[_\-. ]+(?<frame>\d+)(?:[_\-. ]+[^_\-. ]+)?$/.exec(pathStem);
  if (!match?.groups) {
    return pathStem;
  }

  return `${match.groups.prefix} - ${match.groups.frame}`;
}

export function fallbackUploadPlanFrameTitles(plan: WebUploadPlan) {
  return {
    ...plan,
    frames: plan.frames.map((frame) => ({
      ...frame,
      // Manual fallback is intentionally explicit because automatic VOL/m2ts shortening can still
      // collide on mixed-disc work folders where operators need the full source identity visible.
      title: fullFrameTitleFromSourcePath(frame.before.source.relativePath),
    })),
  };
}

function frameIssueState(frame: WebUploadFramePlan, issues: WebUploadIssue[]) {
  const framePaths = new Set([
    frame.before.source.relativePath,
    frame.after.source.relativePath,
    frame.heatmap?.source.relativePath,
    ...frame.misc.map((asset) => asset.source.relativePath),
  ]);
  const frameIssues = issues.filter((issue) => framePaths.has(issue.path));

  return {
    issueCount: frameIssues.length,
    hasError: frameIssues.some((issue) => issue.severity === "error"),
    hasWarning: frameIssues.some((issue) => issue.severity === "warning"),
  };
}

function orderedComparisonLabels(frame: WebUploadFramePlan) {
  const labels = [frame.after.label, ...frame.misc.map((asset) => asset.label)];
  return [...new Set(labels)];
}

export function getUploadPlanHeatmapReferenceOptions(plan: WebUploadPlan) {
  if (plan.frames.length === 0) {
    return [];
  }

  const [firstFrame, ...remainingFrames] = plan.frames;
  const commonLabels = new Set(orderedComparisonLabels(firstFrame));
  for (const frame of remainingFrames) {
    const labels = new Set(orderedComparisonLabels(frame));
    for (const label of [...commonLabels]) {
      if (!labels.has(label)) {
        commonLabels.delete(label);
      }
    }
  }

  // The global heatmap selector must only show columns that every frame can actually use. That
  // prevents a table-level setting from silently falling back on rows where the column is missing.
  return orderedComparisonLabels(firstFrame).filter((label) => commonLabels.has(label));
}

export function buildPlanView(plan: WebUploadPlan): PlanView {
  const heatmapReferenceOptions = getUploadPlanHeatmapReferenceOptions(plan);
  const frames = plan.frames.map((frame) => {
    const issueState = frameIssueState(frame, plan.issues);
    const alternateAfter = frame.misc
      .filter((asset) => asset.label !== "Misc")
      .slice(0, 3)
      .map((asset) => ({
        label: asset.label,
        path: asset.source.relativePath,
      }));

    return {
      frameId: frameIdForFrame(frame),
      order: frame.order,
      title: frame.title,
      beforePath: frame.before.source.relativePath,
      afterPath: frame.after.source.relativePath,
      alternateAfter,
      heatmapPath: frame.heatmap?.source.relativePath ?? null,
      miscCount: frame.misc.length,
      ...issueState,
    };
  });

  return {
    sourceRootName: plan.sourceRootName,
    suggestedGroupSlug: plan.suggestedGroupSlug,
    suggestedGroupTitle: plan.suggestedGroupTitle,
    beforeLabel: plan.frames[0]?.before.label ?? "Before",
    afterLabel: plan.frames[0]?.after.label ?? "After",
    heatmapReferenceLabel: plan.heatmapReferenceLabel,
    heatmapReferenceOptions,
    frames,
    healthyPairCount: frames.filter((frame) => !frame.hasError).length,
    ignoredCount: plan.ignoredFiles.length,
    warningCount: plan.issues.filter((issue) => issue.severity === "warning").length,
    errorCount: plan.issues.filter((issue) => issue.severity === "error").length,
    issues: plan.issues.map((issue) => ({
      severity: issue.severity,
      message: issue.message,
      path: issue.path,
    })),
  };
}

export function renameUploadPlanAssetLabel(
  plan: WebUploadPlan,
  column: UploadPlanImageColumn,
  nextLabel: string,
) {
  const normalizedLabel = nextLabel.trim();
  const currentLabel =
    column.kind === "before"
      ? plan.frames[0]?.before.label
      : column.kind === "after"
        ? plan.frames[0]?.after.label
        : column.label;
  if (!currentLabel || !normalizedLabel || normalizedLabel === currentLabel) {
    return null;
  }
  const currentColumnLabels =
    column.kind === "before"
      ? plan.frames.map((frame) => frame.before.label)
      : column.kind === "after"
        ? plan.frames.map((frame) => frame.after.label)
        : [column.label];
  const currentLabelSet = new Set(currentColumnLabels.map((label) => label.toLowerCase()));
  const existingLabels = new Set(
    plan.frames
      .flatMap((frame) => [frame.before.label, frame.after.label, ...frame.misc.map((asset) => asset.label)])
      .filter((label) => !currentLabelSet.has(label.toLowerCase()))
      .map((label) => label.toLowerCase()),
  );
  // Column labels drive table headers and the global heatmap selector, so keep them unique. The
  // target role is explicit because older scans can contain a misc column also named "After".
  if (normalizedLabel.toLowerCase() === "heatmap" || existingLabels.has(normalizedLabel.toLowerCase())) {
    return null;
  }
  const hasBuiltInColumnWithCurrentLabel = plan.frames.some(
    (frame) =>
      frame.before.label === currentLabel ||
      frame.after.label === currentLabel,
  );
  const shouldRenameHeatmapReference =
    plan.heatmapReferenceLabel === currentLabel &&
    (column.kind !== "misc" || !hasBuiltInColumnWithCurrentLabel);

  return {
    ...plan,
    heatmapReferenceLabel:
      shouldRenameHeatmapReference
        ? normalizedLabel
        : plan.heatmapReferenceLabel,
    frames: plan.frames.map((frame) => ({
      ...frame,
      before:
        column.kind === "before"
          ? { ...frame.before, label: normalizedLabel }
          : frame.before,
      after:
        column.kind === "after"
          ? { ...frame.after, label: normalizedLabel }
          : frame.after,
      misc: frame.misc.map((asset) =>
        column.kind === "misc" && asset.label === column.label
          ? { ...asset, label: normalizedLabel }
          : asset,
      ),
    })),
  };
}

export function setUploadPlanHeatmapReference(
  plan: WebUploadPlan,
  nextLabel: string,
) {
  if (
    plan.heatmapReferenceLabel === nextLabel ||
    !getUploadPlanHeatmapReferenceOptions(plan).includes(nextLabel)
  ) {
    return null;
  }

  return {
    ...plan,
    heatmapReferenceLabel: nextLabel,
  };
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

export function reorderUploadPlan(
  plan: WebUploadPlan,
  activeFrameId: string,
  overFrameId: string | null,
) {
  if (!overFrameId || activeFrameId === overFrameId) {
    return null;
  }

  const frameIds = plan.frames.map(frameIdForFrame);
  const activeIndex = frameIds.indexOf(activeFrameId);
  const overIndex = frameIds.indexOf(overFrameId);
  if (activeIndex === -1 || overIndex === -1) {
    return null;
  }

  return {
    ...plan,
    frames: moveItem(plan.frames, activeIndex, overIndex).map((frame, order) => ({
      ...frame,
      order,
    })),
  };
}
