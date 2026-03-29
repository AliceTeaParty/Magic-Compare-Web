import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSqliteDatabasePath } from "../lib/server/db/database-url";

type ColumnDefinition = {
  name: string;
  sql: string;
};

function listColumns(database: DatabaseSync, tableName: string): Set<string> {
  const rows = database.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((row) => row.name));
}

/**
 * SQLite migrations in this repo are intentionally additive because `pnpm db:push` runs in local
 * and container bootstrap paths where we want schema drift fixed without requiring a separate tool.
 */
function ensureColumns(
  database: DatabaseSync,
  tableName: string,
  definitions: ColumnDefinition[],
): void {
  const existing = listColumns(database, tableName);
  for (const definition of definitions) {
    if (existing.has(definition.name)) {
      continue;
    }
    database.exec(`ALTER TABLE "${tableName}" ADD COLUMN ${definition.sql};`);
  }
}

/**
 * The partial unique index for active upload jobs only works when older databases no longer keep
 * multiple `active` rows per group, so we cancel stale duplicates before rebuilding that guard.
 */
function cancelDuplicateActiveUploadJobs(database: DatabaseSync): void {
  database.exec(`
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "groupId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS "rowNumber"
  FROM "GroupUploadJob"
  WHERE "status" = 'active'
),
duplicate_jobs AS (
  SELECT "id"
  FROM ranked
  WHERE "rowNumber" > 1
)
UPDATE "FrameUploadJob"
SET "status" = 'cancelled'
WHERE "groupUploadJobId" IN (SELECT "id" FROM duplicate_jobs);
`);

  database.exec(`
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "groupId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS "rowNumber"
  FROM "GroupUploadJob"
  WHERE "status" = 'active'
)
UPDATE "GroupUploadJob"
SET "status" = 'cancelled'
WHERE "id" IN (
  SELECT "id"
  FROM ranked
  WHERE "rowNumber" > 1
);
`);
}

/**
 * Prisma cannot declare SQLite partial unique indexes, so init-db owns this additional guard and
 * recreates the supporting indexes on every additive migration run.
 */
function ensureIndexes(database: DatabaseSync): void {
  database.exec(`
DROP INDEX IF EXISTS "GroupUploadJob_groupId_status_updatedAt_idx";
CREATE INDEX IF NOT EXISTS "Case_updatedAt_idx" ON "Case"("updatedAt");
CREATE INDEX IF NOT EXISTS "Group_caseId_isPublic_idx" ON "Group"("caseId", "isPublic");
CREATE INDEX IF NOT EXISTS "GroupUploadJob_groupId_status_expiresAt_updatedAt_idx"
  ON "GroupUploadJob"("groupId", "status", "expiresAt", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "GroupUploadJob_groupId_active_key"
  ON "GroupUploadJob"("groupId")
  WHERE "status" = 'active';
`);
}

/**
 * Keeps the schema bootstrap reusable in tests so we can verify additive migrations and SQLite-only
 * indexes without relying on the side effects of importing this script.
 */
export function initializeSqliteSchema(database: DatabaseSync): void {
  database.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "Case" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT DEFAULT '',
  "summary" TEXT NOT NULL DEFAULT '',
  "tagsJson" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL,
  "coverAssetId" TEXT,
  "publishedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Case_slug_key" ON "Case"("slug");

CREATE TABLE IF NOT EXISTS "Group" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "caseId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "publicSlug" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "order" INTEGER NOT NULL,
  "defaultMode" TEXT NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "tagsJson" TEXT NOT NULL DEFAULT '[]',
  "storageRoot" TEXT NOT NULL DEFAULT '',
  "lastUploadInputHash" TEXT,
  FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Group_publicSlug_key" ON "Group"("publicSlug");
CREATE UNIQUE INDEX IF NOT EXISTS "Group_caseId_slug_key" ON "Group"("caseId", "slug");
CREATE INDEX IF NOT EXISTS "Group_caseId_order_idx" ON "Group"("caseId", "order");

CREATE TABLE IF NOT EXISTS "Frame" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "caption" TEXT NOT NULL DEFAULT '',
  "order" INTEGER NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "storagePrefix" TEXT NOT NULL DEFAULT '',
  FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Frame_groupId_order_idx" ON "Frame"("groupId", "order");

CREATE TABLE IF NOT EXISTS "Asset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "frameId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "thumbUrl" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "isPrimaryDisplay" BOOLEAN NOT NULL DEFAULT false,
  FOREIGN KEY ("frameId") REFERENCES "Frame" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Asset_frameId_idx" ON "Asset"("frameId");

CREATE TABLE IF NOT EXISTS "GroupUploadJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "caseId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "snapshotJson" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "expectedFrameCount" INTEGER NOT NULL,
  "committedFrameCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "FrameUploadJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupUploadJobId" TEXT NOT NULL,
  "frameOrder" INTEGER NOT NULL,
  "frameSnapshotJson" TEXT NOT NULL,
  "preparedAssetsJson" TEXT NOT NULL DEFAULT '',
  "pendingPrefix" TEXT,
  "status" TEXT NOT NULL,
  "committedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("groupUploadJobId") REFERENCES "GroupUploadJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "FrameUploadJob_groupUploadJobId_frameOrder_key"
  ON "FrameUploadJob"("groupUploadJobId", "frameOrder");
CREATE INDEX IF NOT EXISTS "FrameUploadJob_groupUploadJobId_status_idx"
  ON "FrameUploadJob"("groupUploadJobId", "status");
`);

  ensureColumns(database, "Group", [
    { name: "storageRoot", sql: `"storageRoot" TEXT NOT NULL DEFAULT ''` },
    { name: "lastUploadInputHash", sql: `"lastUploadInputHash" TEXT` },
  ]);

  ensureColumns(database, "Frame", [
    { name: "storagePrefix", sql: `"storagePrefix" TEXT NOT NULL DEFAULT ''` },
  ]);

  ensureColumns(database, "GroupUploadJob", [
    { name: "committedFrameCount", sql: `"committedFrameCount" INTEGER NOT NULL DEFAULT 0` },
    { name: "expiresAt", sql: `"expiresAt" DATETIME` },
  ]);

  cancelDuplicateActiveUploadJobs(database);
  ensureIndexes(database);
}

/**
 * Keeps the CLI-facing db bootstrap entrypoint small while sharing the real schema work with unit
 * tests that need a temporary SQLite file.
 */
export function initializeSqliteDatabase(databasePath = resolveSqliteDatabasePath()): void {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  try {
    initializeSqliteSchema(database);
  } finally {
    database.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databasePath = resolveSqliteDatabasePath();
  initializeSqliteDatabase(databasePath);
  console.log(`Initialized SQLite schema at ${databasePath}`);
}
