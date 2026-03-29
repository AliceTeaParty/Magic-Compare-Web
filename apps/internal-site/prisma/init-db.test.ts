import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSqliteDatabase } from "./init-db";

function createTempDatabasePath(): { directory: string; databasePath: string } {
  const directory = mkdtempSync(path.join(os.tmpdir(), "magic-compare-db-"));
  return {
    directory,
    databasePath: path.join(directory, "test.db"),
  };
}

describe("init-db", () => {
  const tempDirectories: string[] = [];

  afterEach(() => {
    while (tempDirectories.length > 0) {
      rmSync(tempDirectories.pop()!, { recursive: true, force: true });
    }
  });

  it("is additive and creates the expected SQLite indexes", () => {
    const { directory, databasePath } = createTempDatabasePath();
    tempDirectories.push(directory);

    initializeSqliteDatabase(databasePath);
    initializeSqliteDatabase(databasePath);

    const database = new DatabaseSync(databasePath);
    try {
      const indexes = database.prepare(`
        SELECT "name", "sql"
        FROM "sqlite_master"
        WHERE "type" = 'index'
      `).all() as Array<{ name: string; sql: string | null }>;

      expect(indexes.some((index) => index.name === "Case_updatedAt_idx")).toBe(true);
      expect(
        indexes.some((index) => index.name === "Group_caseId_isPublic_idx"),
      ).toBe(true);
      expect(
        indexes.some(
          (index) => index.name === "GroupUploadJob_groupId_status_expiresAt_updatedAt_idx",
        ),
      ).toBe(true);
      expect(
        indexes.find((index) => index.name === "GroupUploadJob_groupId_active_key")?.sql,
      ).toContain(`WHERE "status" = 'active'`);
    } finally {
      database.close();
    }
  });

  it("cancels duplicate active upload jobs before applying the partial unique index", () => {
    const { directory, databasePath } = createTempDatabasePath();
    tempDirectories.push(directory);
    const database = new DatabaseSync(databasePath);

    try {
      database.exec(`
        CREATE TABLE "Case" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "slug" TEXT NOT NULL,
          "title" TEXT NOT NULL DEFAULT '',
          "subtitle" TEXT DEFAULT '',
          "summary" TEXT NOT NULL DEFAULT '',
          "tagsJson" TEXT NOT NULL DEFAULT '[]',
          "status" TEXT NOT NULL DEFAULT 'internal',
          "coverAssetId" TEXT,
          "publishedAt" DATETIME,
          "updatedAt" DATETIME NOT NULL,
          "createdAt" DATETIME NOT NULL
        );
        CREATE TABLE "Group" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "caseId" TEXT NOT NULL,
          "slug" TEXT NOT NULL,
          "publicSlug" TEXT,
          "title" TEXT NOT NULL DEFAULT '',
          "description" TEXT NOT NULL DEFAULT '',
          "order" INTEGER NOT NULL DEFAULT 0,
          "defaultMode" TEXT NOT NULL DEFAULT 'before-after',
          "isPublic" BOOLEAN NOT NULL DEFAULT false,
          "tagsJson" TEXT NOT NULL DEFAULT '[]',
          "storageRoot" TEXT NOT NULL DEFAULT '',
          "lastUploadInputHash" TEXT
        );
        CREATE TABLE "GroupUploadJob" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "caseId" TEXT NOT NULL,
          "groupId" TEXT NOT NULL,
          "inputHash" TEXT NOT NULL,
          "snapshotJson" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "expectedFrameCount" INTEGER NOT NULL,
          "committedFrameCount" INTEGER NOT NULL DEFAULT 0,
          "expiresAt" DATETIME,
          "createdAt" DATETIME NOT NULL,
          "updatedAt" DATETIME NOT NULL
        );
        CREATE TABLE "FrameUploadJob" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "groupUploadJobId" TEXT NOT NULL,
          "frameOrder" INTEGER NOT NULL,
          "frameSnapshotJson" TEXT NOT NULL,
          "preparedAssetsJson" TEXT NOT NULL DEFAULT '',
          "pendingPrefix" TEXT,
          "status" TEXT NOT NULL,
          "committedAt" DATETIME,
          "createdAt" DATETIME NOT NULL,
          "updatedAt" DATETIME NOT NULL
        );
        INSERT INTO "Case" (
          "id", "slug", "title", "subtitle", "summary", "tagsJson", "status",
          "coverAssetId", "publishedAt", "updatedAt", "createdAt"
        ) VALUES (
          'case-1', '2026', '2026', '', '', '[]', 'internal',
          NULL, NULL, '2026-03-29T08:00:00.000Z', '2026-03-29T08:00:00.000Z'
        );
        INSERT INTO "Group" (
          "id", "caseId", "slug", "publicSlug", "title", "description", "order",
          "defaultMode", "isPublic", "tagsJson", "storageRoot", "lastUploadInputHash"
        ) VALUES (
          'group-1', 'case-1', 'test-group', NULL, 'Test Group', '', 0,
          'before-after', false, '[]', '/groups/group-1', NULL
        );
        INSERT INTO "GroupUploadJob" (
          "id", "caseId", "groupId", "inputHash", "snapshotJson", "status",
          "expectedFrameCount", "committedFrameCount", "expiresAt", "createdAt", "updatedAt"
        ) VALUES
          ('job-old', 'case-1', 'group-1', 'hash-1', '{}', 'active', 1, 0, NULL, '2026-03-28T08:00:00.000Z', '2026-03-28T08:00:00.000Z'),
          ('job-new', 'case-1', 'group-1', 'hash-2', '{}', 'active', 1, 0, NULL, '2026-03-29T08:00:00.000Z', '2026-03-29T08:00:00.000Z');
        INSERT INTO "FrameUploadJob" (
          "id", "groupUploadJobId", "frameOrder", "frameSnapshotJson", "preparedAssetsJson",
          "pendingPrefix", "status", "committedAt", "createdAt", "updatedAt"
        ) VALUES
          ('frame-old', 'job-old', 0, '{}', '', NULL, 'pending', NULL, '2026-03-28T08:00:00.000Z', '2026-03-28T08:00:00.000Z'),
          ('frame-new', 'job-new', 0, '{}', '', NULL, 'pending', NULL, '2026-03-29T08:00:00.000Z', '2026-03-29T08:00:00.000Z');
      `);
    } finally {
      database.close();
    }

    initializeSqliteDatabase(databasePath);

    const migrated = new DatabaseSync(databasePath);
    try {
      const jobs = migrated.prepare(`
        SELECT "id", "status"
        FROM "GroupUploadJob"
        ORDER BY "updatedAt" DESC
      `).all() as Array<{ id: string; status: string }>;
      const frameJobs = migrated.prepare(`
        SELECT "id", "status"
        FROM "FrameUploadJob"
        ORDER BY "id" ASC
      `).all() as Array<{ id: string; status: string }>;

      expect(jobs).toEqual([
        { id: "job-new", status: "active" },
        { id: "job-old", status: "cancelled" },
      ]);
      expect(frameJobs).toEqual([
        { id: "frame-new", status: "pending" },
        { id: "frame-old", status: "cancelled" },
      ]);

      expect(() =>
        migrated.exec(`
          INSERT INTO "GroupUploadJob" (
            "id", "caseId", "groupId", "inputHash", "snapshotJson", "status",
            "expectedFrameCount", "committedFrameCount", "expiresAt", "createdAt", "updatedAt"
          ) VALUES (
            'job-third', 'case-1', 'group-1', 'hash-3', '{}', 'active',
            1, 0, NULL, '2026-03-30T08:00:00.000Z', '2026-03-30T08:00:00.000Z'
          );
        `),
      ).toThrow();
    } finally {
      migrated.close();
    }
  });
});
