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
  frames: FramePreviewRow[];
  healthyPairCount: number;
  ignoredCount: number;
  warningCount: number;
  errorCount: number;
  issues: Array<{ severity: "warning" | "error"; message: string; path: string }>;
}

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

export function buildPlanView(plan: WebUploadPlan): PlanView {
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
