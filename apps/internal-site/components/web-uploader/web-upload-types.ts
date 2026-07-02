import type { ViewerMode } from "@magic-compare/content-schema";

export type WebUploadStage =
  | "idle"
  | "scanned"
  | "generating"
  | "ready"
  | "uploading"
  | "paused"
  | "completed"
  | "failed";

export type WebUploadIssueSeverity = "warning" | "error";

export interface BrowserUploadFile {
  file: File;
  relativePath: string;
}

export interface WebUploadIssue {
  code: string;
  severity: WebUploadIssueSeverity;
  path: string;
  message: string;
}

export interface IgnoredUploadFile {
  path: string;
  reason: string;
}

export interface WebUploadAssetPlan {
  kind: "before" | "after" | "heatmap" | "misc";
  label: string;
  note: string;
  source: BrowserUploadFile;
}

export interface WebUploadFramePlan {
  order: number;
  title: string;
  caption: string;
  before: WebUploadAssetPlan;
  after: WebUploadAssetPlan;
  heatmap: WebUploadAssetPlan | null;
  misc: WebUploadAssetPlan[];
}

export interface WebUploadPlan {
  sourceRootName: string;
  suggestedGroupSlug: string;
  suggestedGroupTitle: string;
  heatmapReferenceLabel: string;
  frames: WebUploadFramePlan[];
  ignoredFiles: IgnoredUploadFile[];
  issues: WebUploadIssue[];
}

export interface WebUploadGroupMetadata {
  slug: string;
  title: string;
  description: string;
  defaultMode: ViewerMode;
  order: number;
  tags: string[];
}

export interface GeneratedUploadFile {
  blob: Blob;
  extension: string;
  contentType: string;
  sha256: string;
  size: number;
}

export interface GeneratedUploadAsset {
  slot: string;
  kind: WebUploadAssetPlan["kind"];
  label: string;
  note: string;
  width: number;
  height: number;
  isPrimaryDisplay: boolean;
  original: GeneratedUploadFile;
  thumbnail: GeneratedUploadFile;
}

export interface GeneratedUploadFrame {
  order: number;
  title: string;
  caption: string;
  assets: GeneratedUploadAsset[];
}

export interface UploadRunnerFrameSnapshot {
  frameOrder: number;
  title: string;
  status:
    | "pending"
    | "preparing"
    | "prepared"
    | "uploading"
    | "uploaded"
    | "committing"
    | "committed"
    | "failed"
    | "skipped";
  completedFiles: number;
  totalFiles: number;
  error: string | null;
}

export interface UploadRunnerSnapshot {
  stage: WebUploadStage;
  jobId: string | null;
  inputHash: string | null;
  completedFrames: number;
  totalFrames: number;
  completedFiles: number;
  totalFiles: number;
  failedCount: number;
  retriedCount: number;
  message: string;
  frames: UploadRunnerFrameSnapshot[];
  result: {
    caseSlug: string;
    groupSlug: string;
    committedFrameCount: number;
  } | null;
}
