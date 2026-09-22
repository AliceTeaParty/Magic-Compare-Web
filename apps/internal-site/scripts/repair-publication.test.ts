import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSqliteDatabase } from "../prisma/init-db";

const execFile = promisify(execFileCallback);
const temporaryRoots: string[] = [];

/** Builds a schema-valid manifest so the subprocess scans the same artifact shape as production. */
function createManifest(caseSlug: string, groupId: string, publicSlug: string) {
  return {
    schemaVersion: 2,
    publicSlug,
    generatedAt: "2026-09-22T00:00:00.000Z",
    assetBasePath: "https://assets.example.com/groups/example",
    case: {
      slug: caseSlug,
      title: "Example",
      subtitle: "",
      summary: "",
      tags: [],
      publishedAt: null,
    },
    group: {
      id: groupId,
      slug: "comparison",
      publicSlug,
      title: "Comparison",
      description: "",
      defaultMode: "before-after",
      tags: [],
    },
    frames: [
      {
        id: "frame-1",
        title: "Frame 1",
        caption: "",
        order: 0,
        assets: [
          {
            id: "asset-before",
            kind: "before",
            label: "Before",
            imageUrl: "https://assets.example.com/before.png",
            thumbUrl: "https://assets.example.com/before-thumb.png",
            width: 1280,
            height: 720,
            note: "",
            isPrimaryDisplay: true,
          },
          {
            id: "asset-after",
            kind: "after",
            label: "After",
            imageUrl: "https://assets.example.com/after.png",
            thumbUrl: "https://assets.example.com/after-thumb.png",
            width: 1280,
            height: 720,
            note: "",
            isPrimaryDisplay: true,
          },
        ],
      },
    ],
  };
}

/** Writes one real bundle directory for the CLI subprocess to inspect and prune. */
async function writePublishedManifest(
  publishedRoot: string,
  publicSlug: string,
  manifest: ReturnType<typeof createManifest>,
): Promise<void> {
  const directory = path.join(publishedRoot, "groups", publicSlug);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest), "utf8");
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("repair-publication CLI", () => {
  it("repairs an internal case and prunes only its stale identified published bundles", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "magic-compare-repair-publication-"));
    temporaryRoots.push(root);
    const databasePath = path.join(root, "repair.db");
    const publishedRoot = path.join(root, "published");
    initializeSqliteDatabase(databasePath);

    const database = new DatabaseSync(databasePath);
    try {
      database
        .prepare(
          `
            INSERT INTO "Case" ("id", "slug", "title", "status", "coverAssetId")
            VALUES (?, ?, ?, ?, ?)
          `,
        )
        .run("case-1", "repair-case", "Repair Case", "published", "obsolete-cover");
      database
        .prepare(
          `
            INSERT INTO "Group" (
              "id", "caseId", "slug", "title", "order", "defaultMode", "isPublic", "storageRoot"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          "hidden-group",
          "case-1",
          "hidden",
          "Hidden group",
          0,
          "before-after",
          0,
          "/groups/hidden-group",
        );
    } finally {
      database.close();
    }

    await writePublishedManifest(
      publishedRoot,
      "repair-case--hidden",
      createManifest("repair-case", "hidden-group", "repair-case--hidden"),
    );
    await writePublishedManifest(
      publishedRoot,
      "repair-case--deleted",
      createManifest("repair-case", "deleted-group", "repair-case--deleted"),
    );
    await writePublishedManifest(
      publishedRoot,
      "other-case--comparison",
      createManifest("other-case", "other-group", "other-case--comparison"),
    );
    const unidentifiedDirectory = path.join(publishedRoot, "groups", "unidentified");
    await mkdir(unidentifiedDirectory, { recursive: true });
    await writeFile(path.join(unidentifiedDirectory, "manifest.json"), "not json", "utf8");

    const { stdout } = await execFile(
      "pnpm",
      ["exec", "tsx", "scripts/repair-publication.ts", "repair-case"],
      {
        cwd: path.resolve(process.cwd()),
        env: {
          ...process.env,
          DATABASE_URL: `file:${databasePath}`,
          MAGIC_COMPARE_PUBLISHED_ROOT: publishedRoot,
        },
      },
    );

    expect(JSON.parse(stdout)).toEqual({
      caseSlug: "repair-case",
      activePublicGroupCount: 0,
      prunedPublicSlugs: ["repair-case--deleted", "repair-case--hidden"],
      skippedUnidentifiedDirectories: ["unidentified"],
    });
    await expect(readFile(path.join(unidentifiedDirectory, "manifest.json"), "utf8")).resolves.toBe(
      "not json",
    );
    await expect(
      readFile(
        path.join(publishedRoot, "groups", "other-case--comparison", "manifest.json"),
        "utf8",
      ),
    ).resolves.toContain('"other-case"');

    const repairedDatabase = new DatabaseSync(databasePath);
    try {
      const repairedCase = repairedDatabase
        .prepare(`SELECT "status", "publishedAt", "coverAssetId" FROM "Case" WHERE "id" = ?`)
        .get("case-1") as { status: string; publishedAt: unknown; coverAssetId: string | null };
      expect(repairedCase).toEqual({ status: "internal", publishedAt: null, coverAssetId: null });
    } finally {
      repairedDatabase.close();
    }
  });
});
