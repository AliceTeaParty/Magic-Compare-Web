import { constants as fsConstants, existsSync, readdirSync } from "node:fs";
import { access } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  loadWorkspaceEnvFromModule,
  resolveDefaultPublishedRoot,
  resolveWorkspaceRoot,
} from "../packages/shared-utils/src/workspace-env";

const REQUIRED_NODE_MAJOR = 24;
const REQUIRED_PNPM_VERSION = "10.32.1";
const S3_ENV_NAMES = [
  "MAGIC_COMPARE_S3_BUCKET",
  "MAGIC_COMPARE_S3_PUBLIC_BASE_URL",
  "MAGIC_COMPARE_S3_ACCESS_KEY_ID",
  "MAGIC_COMPARE_S3_SECRET_ACCESS_KEY",
] as const;

export type DoctorScope = "internal" | "public" | "all";
export type DoctorStatus = "ok" | "warning" | "error";

export interface DoctorCheck {
  status: DoctorStatus;
  label: string;
  message: string;
}

type PortProbe = (port: number) => Promise<boolean>;
type WritableProbe = (databasePath: string) => Promise<boolean>;

function check(status: DoctorStatus, label: string, message: string): DoctorCheck {
  return { status, label, message };
}

export function validateRuntimeVersions(
  nodeVersion: string,
  packageManagerUserAgent: string | undefined,
): DoctorCheck[] {
  const nodeMajor = Number.parseInt(nodeVersion.replace(/^v/, "").split(".")[0] ?? "", 10);
  const pnpmVersion = /(?:^|\s)pnpm\/([^\s]+)/.exec(packageManagerUserAgent ?? "")?.[1];

  return [
    nodeMajor === REQUIRED_NODE_MAJOR
      ? check("ok", "Node.js", nodeVersion)
      : check(
          "error",
          "Node.js",
          `需要 Node ${REQUIRED_NODE_MAJOR}.x，当前为 ${nodeVersion || "未知版本"}。`,
        ),
    pnpmVersion === REQUIRED_PNPM_VERSION
      ? check("ok", "pnpm", pnpmVersion)
      : check(
          "error",
          "pnpm",
          `需要 pnpm ${REQUIRED_PNPM_VERSION}，当前为 ${pnpmVersion ?? "未知版本"}。`,
        ),
  ];
}

function isAbsoluteUrl(value: string | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }

  try {
    return Boolean(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Validates the S3 variable group without reading or printing credential values. */
export function validateS3Configuration(environment: NodeJS.ProcessEnv): DoctorCheck[] {
  const presentNames = S3_ENV_NAMES.filter((name) => Boolean(environment[name]?.trim()));
  if (presentNames.length === 0) {
    return [
      check("warning", "S3/R2", "未配置对象存储；Case 管理可用，上传、素材检查和发布不可用。"),
    ];
  }

  if (presentNames.length !== S3_ENV_NAMES.length) {
    const missingNames = S3_ENV_NAMES.filter((name) => !environment[name]?.trim());
    return [check("error", "S3/R2", `配置不完整，缺少：${missingNames.join(", ")}`)];
  }

  const invalidUrls = ["MAGIC_COMPARE_S3_PUBLIC_BASE_URL", "MAGIC_COMPARE_S3_ENDPOINT"].filter(
    (name) => environment[name]?.trim() && !isAbsoluteUrl(environment[name]),
  );
  if (invalidUrls.length > 0) {
    return [check("error", "S3/R2", `以下变量必须是绝对 URL：${invalidUrls.join(", ")}`)];
  }

  return [check("ok", "S3/R2", "对象存储变量已成组配置。")];
}

export function resolveLocalDatabasePath(databaseUrl: string, workspaceRoot: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("本地开发只支持 file: SQLite DATABASE_URL。");
  }

  const [fileTarget] = databaseUrl.slice("file:".length).split("?", 1);
  if (!fileTarget) {
    throw new Error("DATABASE_URL 缺少 SQLite 文件路径。");
  }

  return path.isAbsolute(fileTarget)
    ? fileTarget
    : path.resolve(workspaceRoot, "apps", "internal-site", "prisma", fileTarget);
}

/** SQLite needs both the database file and its nearest existing parent to be writable. */
async function canWriteDatabase(databasePath: string): Promise<boolean> {
  let existingParent = path.dirname(databasePath);
  while (!existsSync(existingParent)) {
    const parent = path.dirname(existingParent);
    if (parent === existingParent) {
      return false;
    }
    existingParent = parent;
  }

  try {
    await access(existingParent, fsConstants.W_OK);
    if (existsSync(databasePath)) {
      await access(databasePath, fsConstants.W_OK);
    }
    return true;
  } catch {
    return false;
  }
}

export async function validateSqliteConfiguration(
  databaseUrl: string,
  workspaceRoot: string,
  writableProbe: WritableProbe = canWriteDatabase,
): Promise<DoctorCheck[]> {
  try {
    const databasePath = resolveLocalDatabasePath(databaseUrl, workspaceRoot);
    return (await writableProbe(databasePath))
      ? [check("ok", "SQLite", databasePath)]
      : [check("error", "SQLite", `数据库路径不可写：${databasePath}`)];
  } catch (error) {
    return [
      check("error", "SQLite", error instanceof Error ? error.message.trim() : "数据库配置无效。"),
    ];
  }
}

export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function validatePorts(
  scope: DoctorScope,
  portProbe: PortProbe = isPortAvailable,
): Promise<DoctorCheck[]> {
  const requestedPorts = scope === "all" ? [3000, 3001] : [scope === "internal" ? 3000 : 3001];
  const results = await Promise.all(
    requestedPorts.map(async (port) =>
      (await portProbe(port))
        ? check("ok", `端口 ${port}`, "可用")
        : check("error", `端口 ${port}`, "已被占用；请先停止现有服务。"),
    ),
  );
  return results;
}

function inspectPublishedRoot(environment: NodeJS.ProcessEnv, workspaceRoot: string): DoctorCheck {
  const publishedRoot = environment.MAGIC_COMPARE_PUBLISHED_ROOT?.trim()
    ? path.resolve(environment.MAGIC_COMPARE_PUBLISHED_ROOT)
    : resolveDefaultPublishedRoot(workspaceRoot);
  const groupsRoot = path.join(publishedRoot, "groups");

  if (!existsSync(groupsRoot)) {
    return check("warning", "公开内容", `尚无 published groups：${groupsRoot}`);
  }

  const manifestCount = readdirSync(groupsRoot, { withFileTypes: true }).filter(
    (entry) =>
      entry.isDirectory() && existsSync(path.join(groupsRoot, entry.name, "manifest.json")),
  ).length;
  return manifestCount > 0
    ? check("ok", "公开内容", `${manifestCount} 个 Group manifest`)
    : check("warning", "公开内容", `目录存在但没有 Group manifest：${groupsRoot}`);
}

/** Collects independent checks so callers and tests can distinguish blockers from useful warnings. */
export async function collectDoctorChecks(
  scope: DoctorScope,
  environment: NodeJS.ProcessEnv,
  workspaceRoot: string,
  dependencies: { portProbe?: PortProbe; writableProbe?: WritableProbe } = {},
): Promise<DoctorCheck[]> {
  const checks = validateRuntimeVersions(process.version, environment.npm_config_user_agent);
  if (scope === "internal" || scope === "all") {
    checks.push(
      ...(await validateSqliteConfiguration(
        environment.DATABASE_URL?.trim() || "file:./dev.db",
        workspaceRoot,
        dependencies.writableProbe,
      )),
      ...validateS3Configuration(environment),
    );
  }
  if (scope === "public" || scope === "all") {
    checks.push(inspectPublishedRoot(environment, workspaceRoot));
  }
  checks.push(...(await validatePorts(scope, dependencies.portProbe)));
  return checks;
}

function parseScope(value: string | undefined): DoctorScope {
  if (!value || value === "internal") {
    return "internal";
  }
  if (value === "public" || value === "all") {
    return value;
  }
  throw new Error(`未知 dev:doctor 范围：${value}`);
}

/** CLI entrypoint keeps diagnostics concise and never prints environment values that may be secret. */
async function main(): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot(import.meta.url, 1);
  loadWorkspaceEnvFromModule(import.meta.url, 1);
  const scope = parseScope(process.argv[2]);
  const checks = await collectDoctorChecks(scope, process.env, workspaceRoot);
  const markers: Record<DoctorStatus, string> = { ok: "OK", warning: "WARN", error: "ERROR" };

  console.log(`Development environment check (${scope}):`);
  for (const item of checks) {
    console.log(`[${markers[item.status]}] ${item.label}: ${item.message}`);
  }

  if (checks.some((item) => item.status === "error")) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
