import path from "node:path";

export const DEFAULT_DATABASE_URL = "file:./dev.db";

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
}

export function resolveSqliteDatabasePath(databaseUrl = getDatabaseUrl()): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`Unsupported SQLite DATABASE_URL: ${databaseUrl}`);
  }

  const [fileTarget] = databaseUrl.slice("file:".length).split("?", 1);
  if (!fileTarget) {
    throw new Error(`Invalid SQLite DATABASE_URL: ${databaseUrl}`);
  }

  if (path.isAbsolute(fileTarget)) {
    return fileTarget;
  }

  return path.resolve(process.cwd(), "prisma", fileTarget);
}
