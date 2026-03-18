import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prismaDir = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.join(prismaDir, "dev.db");

const sql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "Case" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT NOT NULL DEFAULT '',
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
`;

mkdirSync(prismaDir, { recursive: true });
execFileSync("sqlite3", [databasePath], {
  input: sql,
  stdio: ["pipe", "inherit", "inherit"],
});

console.log(`Initialized SQLite schema at ${databasePath}`);
