import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../../generated/prisma/client";
import { resolveSqliteDatabaseUrl } from "./database-url";

/**
 * Uses the Prisma 7 SQLite adapter with the legacy integer timestamp format. Existing databases
 * were written by Prisma's native driver, so changing to the adapter default ISO format would make
 * old and new DateTime rows incompatible in the same columns.
 */
export function createPrismaClient(databaseUrl?: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3(
    { url: resolveSqliteDatabaseUrl(databaseUrl) },
    { timestampFormat: "unixepoch-ms" },
  );

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}
