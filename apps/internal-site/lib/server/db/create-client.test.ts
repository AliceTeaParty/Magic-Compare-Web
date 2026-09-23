import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSqliteDatabase } from "../../../prisma/init-db";
import { createPrismaClient } from "./create-client";

describe("Prisma 7 SQLite client", () => {
  const tempDirectories: string[] = [];

  afterEach(() => {
    while (tempDirectories.length > 0) {
      rmSync(tempDirectories.pop()!, { recursive: true, force: true });
    }
  });

  it("reads legacy integer dates and keeps new dates in the same format", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "magic-compare-prisma-"));
    const databasePath = path.join(directory, "legacy.db");
    const legacyPublishedAt = Date.UTC(2026, 0, 2, 3, 4, 5);
    tempDirectories.push(directory);
    initializeSqliteDatabase(databasePath);

    const rawDatabase = new DatabaseSync(databasePath);
    try {
      rawDatabase
        .prepare(
          `
            INSERT INTO "Case" (
              "id", "slug", "title", "subtitle", "summary", "tagsJson", "status",
              "coverAssetId", "publishedAt", "updatedAt", "createdAt"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          "legacy-case",
          "legacy-case",
          "Legacy case",
          "",
          "",
          "[]",
          "legacy-status",
          null,
          legacyPublishedAt,
          legacyPublishedAt,
          legacyPublishedAt,
        );
    } finally {
      rawDatabase.close();
    }

    const client = createPrismaClient(`file:${databasePath}`);
    const nextPublishedAt = new Date("2026-02-03T04:05:06.000Z");
    try {
      const legacyCase = await client.case.findUniqueOrThrow({ where: { id: "legacy-case" } });
      expect(legacyCase.publishedAt?.getTime()).toBe(legacyPublishedAt);
      expect(legacyCase.status).toBe("legacy-status");

      await client.case.update({
        where: { id: "legacy-case" },
        data: { publishedAt: nextPublishedAt },
      });
    } finally {
      await client.$disconnect();
    }

    const updatedDatabase = new DatabaseSync(databasePath);
    try {
      const row = updatedDatabase
        .prepare(`SELECT "publishedAt", typeof("publishedAt") AS "storageType" FROM "Case"`)
        .get() as { publishedAt: number; storageType: string };
      expect(row).toEqual({ publishedAt: nextPublishedAt.getTime(), storageType: "integer" });
    } finally {
      updatedDatabase.close();
    }
  });

  it("preserves the SQLite-only active upload constraint", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "magic-compare-prisma-"));
    const databasePath = path.join(directory, "constraint.db");
    tempDirectories.push(directory);
    initializeSqliteDatabase(databasePath);

    const client = createPrismaClient(`file:${databasePath}`);
    try {
      await client.case.create({
        data: {
          id: "case-1",
          slug: "case-1",
          title: "Case 1",
          status: "internal",
        },
      });
      await client.group.create({
        data: {
          id: "group-1",
          caseId: "case-1",
          slug: "group-1",
          title: "Group 1",
          order: 0,
          defaultMode: "before-after",
          storageRoot: "/groups/group-1",
        },
      });
      await client.groupUploadJob.create({
        data: {
          id: "job-1",
          caseId: "case-1",
          groupId: "group-1",
          inputHash: "hash-1",
          snapshotJson: "{}",
          status: "active",
          expectedFrameCount: 1,
        },
      });

      await expect(
        client.groupUploadJob.create({
          data: {
            id: "job-2",
            caseId: "case-1",
            groupId: "group-1",
            inputHash: "hash-2",
            snapshotJson: "{}",
            status: "active",
            expectedFrameCount: 1,
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    } finally {
      await client.$disconnect();
    }
  });
});
