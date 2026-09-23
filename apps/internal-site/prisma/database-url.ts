import path from "node:path";

export const DEFAULT_DATABASE_URL = "file:./dev.db";

/**
 * Resolves SQLite URLs against the same prisma directory for both the Prisma CLI and the runtime
 * adapter. Prisma 7 moved CLI datasource configuration out of schema.prisma, so keeping this rule
 * shared prevents generate, bootstrap, and application queries from silently targeting different
 * files.
 */
export function resolveSqliteDatabasePath(
  databaseUrl: string,
  workingDirectory = process.cwd(),
): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`Unsupported SQLite DATABASE_URL: ${databaseUrl}`);
  }

  const [fileTarget] = databaseUrl.slice("file:".length).split("?", 1);
  if (!fileTarget) {
    throw new Error(`Invalid SQLite DATABASE_URL: ${databaseUrl}`);
  }

  return path.isAbsolute(fileTarget)
    ? fileTarget
    : path.resolve(workingDirectory, "prisma", fileTarget);
}

/** The adapter and Prisma CLI both receive an absolute URL so their own cwd rules cannot diverge. */
export function resolveSqliteDatabaseUrl(
  databaseUrl: string,
  workingDirectory = process.cwd(),
): string {
  const queryIndex = databaseUrl.indexOf("?");
  const query = queryIndex >= 0 ? databaseUrl.slice(queryIndex) : "";
  return `file:${resolveSqliteDatabasePath(databaseUrl, workingDirectory)}${query}`;
}
