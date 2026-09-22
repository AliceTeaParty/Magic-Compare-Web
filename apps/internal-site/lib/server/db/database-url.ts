import { loadWorkspaceEnv } from "../env/load-workspace-env";
import {
  DEFAULT_DATABASE_URL,
  resolveSqliteDatabasePath as resolveDatabasePath,
  resolveSqliteDatabaseUrl as resolveDatabaseUrl,
} from "../../../prisma/database-url";

export { DEFAULT_DATABASE_URL };

export function getDatabaseUrl(): string {
  loadWorkspaceEnv();
  return process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
}

export function resolveSqliteDatabasePath(databaseUrl = getDatabaseUrl()): string {
  return resolveDatabasePath(databaseUrl);
}

export function resolveSqliteDatabaseUrl(databaseUrl = getDatabaseUrl()): string {
  return resolveDatabaseUrl(databaseUrl);
}
