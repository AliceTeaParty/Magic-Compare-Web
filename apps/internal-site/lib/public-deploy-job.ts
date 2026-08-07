export const PUBLIC_DEPLOY_STAGES = ["checking", "building", "preparing", "uploading"] as const;

export type PublicDeployStage = (typeof PUBLIC_DEPLOY_STAGES)[number];
export type PublicDeployJobStatus = "running" | "succeeded" | "failed";

export interface PublicDeployUploadProgress {
  completed: number;
  total: number;
}

export interface PublicDeployJob {
  id: string;
  status: PublicDeployJobStatus;
  stage: PublicDeployStage;
  stageSequence: PublicDeployStage[];
  completedStageCount: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  elapsedMs: number | null;
  stageDurationsMs: Partial<Record<PublicDeployStage, number>>;
  uploadProgress: PublicDeployUploadProgress | null;
  projectName: string;
  branch: string | null;
  publicSiteUrl: string | null;
  skipped: boolean;
  error: string | null;
}

export interface StartPublicDeployJobResult {
  job: PublicDeployJob;
  reused: boolean;
}

export const PUBLIC_DEPLOY_STAGE_LABELS: Record<PublicDeployStage, string> = {
  checking: "检查发布内容",
  building: "同步并构建公开页面",
  preparing: "整理部署文件",
  uploading: "上传到 Cloudflare Pages",
};

const DEPLOY_ERROR_NOISE_PREFIXES = [
  "⚠",
  "Each child in a list",
  "Check the top-level render call",
  "See https://",
  "> @magic-compare/",
];

/** Keeps viewport feedback useful while the complete command output remains in persisted state. */
export function summarizePublicDeployError(error: string, maxLength = 180): string {
  const lines = error
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const command = lines[0]?.replace(/^Command failed:\s*/i, "") || "部署公开站点失败。";
  const detail = lines.find(
    (line, index) =>
      index > 0 && !DEPLOY_ERROR_NOISE_PREFIXES.some((prefix) => line.startsWith(prefix)),
  );
  const summary = detail ? `${command}：${detail}` : command;
  const characters = Array.from(summary);
  return characters.length > maxLength
    ? `${characters.slice(0, Math.max(1, maxLength - 1)).join("")}…`
    : summary;
}
