import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_CASE_SLUG,
  HIDE_DEMO_ENV_NAME,
  parseEnvFlag,
  PUBLISHED_ROOT_ENV_NAME,
} from "@magic-compare/shared-utils";
import { loadWorkspaceEnv } from "./env/load-workspace-env";
export const PUBLIC_EXPORT_DIR_ENV_NAME = "MAGIC_COMPARE_PUBLIC_EXPORT_DIR";
export const S3_BUCKET_ENV_NAME = "MAGIC_COMPARE_S3_BUCKET";
export const S3_REGION_ENV_NAME = "MAGIC_COMPARE_S3_REGION";
export const S3_ENDPOINT_ENV_NAME = "MAGIC_COMPARE_S3_ENDPOINT";
export const S3_PUBLIC_BASE_URL_ENV_NAME = "MAGIC_COMPARE_S3_PUBLIC_BASE_URL";
export const S3_ACCESS_KEY_ID_ENV_NAME = "MAGIC_COMPARE_S3_ACCESS_KEY_ID";
export const S3_SECRET_ACCESS_KEY_ENV_NAME = "MAGIC_COMPARE_S3_SECRET_ACCESS_KEY";
export const S3_FORCE_PATH_STYLE_ENV_NAME = "MAGIC_COMPARE_S3_FORCE_PATH_STYLE";
export const S3_INTERNAL_PREFIX_ENV_NAME = "MAGIC_COMPARE_S3_INTERNAL_PREFIX";
export const PUBLIC_SITE_BASE_URL_ENV_NAME = "MAGIC_COMPARE_PUBLIC_SITE_BASE_URL";
export const CF_PAGES_PROJECT_NAME_ENV_NAME = "MAGIC_COMPARE_CF_PAGES_PROJECT_NAME";
export const CF_PAGES_BRANCH_ENV_NAME = "MAGIC_COMPARE_CF_PAGES_BRANCH";
export const CF_ACCOUNT_ID_ENV_NAME = "CLOUDFLARE_ACCOUNT_ID";
export const CF_API_TOKEN_ENV_NAME = "CLOUDFLARE_API_TOKEN";

export interface InternalAssetStorageConfig {
  bucket: string;
  region: string;
  endpoint: string | undefined;
  publicBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  objectPrefix: string;
}

function workspaceRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../../..");
}

function requireEnv(name: string): string {
  loadWorkspaceEnv();
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireAbsoluteUrlEnv(name: string): string {
  const value = requireEnv(name);

  try {
    const normalized = new URL(value).toString();
    return normalized.replace(/\/+$/, "");
  } catch {
    throw new Error(`Environment variable ${name} must be an absolute URL.`);
  }
}

export function getOptionalAbsoluteUrlEnv(name: string): string | null {
  loadWorkspaceEnv();
  const value = process.env[name]?.trim();
  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString().replace(/\/+$/, "");
  } catch {
    throw new Error(`Environment variable ${name} must be an absolute URL.`);
  }
}

export function shouldHideDemoContent(): boolean {
  loadWorkspaceEnv();
  return parseEnvFlag(process.env[HIDE_DEMO_ENV_NAME]);
}

export function isHiddenDemoCaseSlug(caseSlug: string): boolean {
  return shouldHideDemoContent() && caseSlug === DEMO_CASE_SLUG;
}

export function getPublishedRoot(): string {
  loadWorkspaceEnv();
  const configured = process.env[PUBLISHED_ROOT_ENV_NAME]?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(workspaceRoot(), "content", "published");
}

export function getPublicExportDir(): string {
  loadWorkspaceEnv();
  const configured = process.env[PUBLIC_EXPORT_DIR_ENV_NAME]?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(workspaceRoot(), "dist", "public-site");
}

export function isInternalAssetStorageConfigured(): boolean {
  loadWorkspaceEnv();
  return Boolean(
    process.env[S3_BUCKET_ENV_NAME]?.trim() &&
      process.env[S3_PUBLIC_BASE_URL_ENV_NAME]?.trim() &&
      process.env[S3_ACCESS_KEY_ID_ENV_NAME]?.trim() &&
      process.env[S3_SECRET_ACCESS_KEY_ENV_NAME]?.trim(),
  );
}

export function getInternalAssetStorageConfig(): InternalAssetStorageConfig {
  loadWorkspaceEnv();
  return {
    bucket: requireEnv(S3_BUCKET_ENV_NAME),
    region: process.env[S3_REGION_ENV_NAME]?.trim() || "auto",
    endpoint: process.env[S3_ENDPOINT_ENV_NAME]?.trim() || undefined,
    publicBaseUrl: requireAbsoluteUrlEnv(S3_PUBLIC_BASE_URL_ENV_NAME),
    accessKeyId: requireEnv(S3_ACCESS_KEY_ID_ENV_NAME),
    secretAccessKey: requireEnv(S3_SECRET_ACCESS_KEY_ENV_NAME),
    forcePathStyle: parseEnvFlag(process.env[S3_FORCE_PATH_STYLE_ENV_NAME]),
    objectPrefix: process.env[S3_INTERNAL_PREFIX_ENV_NAME]?.trim() || "",
  };
}

export function getCfPagesProjectName(): string | null {
  loadWorkspaceEnv();
  return process.env[CF_PAGES_PROJECT_NAME_ENV_NAME]?.trim() || null;
}

export function getCfPagesBranch(): string | null {
  loadWorkspaceEnv();
  return process.env[CF_PAGES_BRANCH_ENV_NAME]?.trim() || null;
}

export function isCloudflarePagesDeployConfigured(): boolean {
  loadWorkspaceEnv();
  return Boolean(
    process.env[CF_PAGES_PROJECT_NAME_ENV_NAME]?.trim() &&
      process.env[CF_ACCOUNT_ID_ENV_NAME]?.trim() &&
      process.env[CF_API_TOKEN_ENV_NAME]?.trim(),
  );
}
