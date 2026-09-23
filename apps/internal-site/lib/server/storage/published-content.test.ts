import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type PublishManifest } from "@magic-compare/content-schema";
import { PUBLISHED_ROOT_ENV_NAME } from "@magic-compare/shared-utils";

const filesystem = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
const mockedFilesystem = vi.hoisted(() => ({
  rename: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    rename: mockedFilesystem.rename,
    writeFile: mockedFilesystem.writeFile,
  };
});

import { writePublishedManifest } from "./published-content";

const temporaryRoots: string[] = [];
const originalPublishedRoot = process.env[PUBLISHED_ROOT_ENV_NAME];

function createManifest(): PublishManifest {
  return {
    schemaVersion: 2,
    publicSlug: "example--comparison",
    generatedAt: "2026-09-22T00:00:00.000Z",
    assetBasePath: "https://assets.example.com/groups/example",
    case: {
      slug: "example",
      title: "Example",
      subtitle: "",
      summary: "",
      tags: [],
      publishedAt: null,
    },
    group: {
      id: "group-1",
      slug: "comparison",
      publicSlug: "example--comparison",
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

async function createPublishedRoot(): Promise<string> {
  const root = await filesystem.mkdtemp(path.join(tmpdir(), "magic-compare-published-test-"));
  temporaryRoots.push(root);
  process.env[PUBLISHED_ROOT_ENV_NAME] = root;
  return root;
}

beforeEach(() => {
  mockedFilesystem.writeFile.mockReset();
  mockedFilesystem.writeFile.mockImplementation(filesystem.writeFile);
  mockedFilesystem.rename.mockReset();
  mockedFilesystem.rename.mockImplementation(filesystem.rename);
});

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => filesystem.rm(root, { recursive: true, force: true })),
  );
  if (originalPublishedRoot === undefined) {
    delete process.env[PUBLISHED_ROOT_ENV_NAME];
  } else {
    process.env[PUBLISHED_ROOT_ENV_NAME] = originalPublishedRoot;
  }
});

describe("published manifest storage", () => {
  it("atomically replaces a complete valid manifest", async () => {
    const root = await createPublishedRoot();
    const directory = path.join(root, "groups", "example--comparison");
    const manifestPath = path.join(directory, "manifest.json");
    await filesystem.mkdir(directory, { recursive: true });
    await filesystem.writeFile(manifestPath, '{"previous":true}', "utf8");

    const manifest = createManifest();
    await writePublishedManifest("example--comparison", manifest);

    await expect(filesystem.readFile(manifestPath, "utf8")).resolves.toBe(
      JSON.stringify(manifest, null, 2),
    );
    await expect(filesystem.readdir(directory)).resolves.toEqual(["manifest.json"]);
  });

  it("keeps the previous manifest when writing the replacement fails", async () => {
    const root = await createPublishedRoot();
    const directory = path.join(root, "groups", "example--comparison");
    const manifestPath = path.join(directory, "manifest.json");
    await filesystem.mkdir(directory, { recursive: true });
    await filesystem.writeFile(manifestPath, '{"previous":true}', "utf8");
    mockedFilesystem.writeFile.mockRejectedValueOnce(new Error("disk full"));

    await expect(writePublishedManifest("example--comparison", createManifest())).rejects.toThrow(
      "disk full",
    );

    await expect(filesystem.readFile(manifestPath, "utf8")).resolves.toBe('{"previous":true}');
    await expect(filesystem.readdir(directory)).resolves.toEqual(["manifest.json"]);
  });

  it("keeps the previous manifest and removes the replacement when switching fails", async () => {
    const root = await createPublishedRoot();
    const directory = path.join(root, "groups", "example--comparison");
    const manifestPath = path.join(directory, "manifest.json");
    await filesystem.mkdir(directory, { recursive: true });
    await filesystem.writeFile(manifestPath, '{"previous":true}', "utf8");
    mockedFilesystem.rename.mockRejectedValueOnce(new Error("rename failed"));

    await expect(writePublishedManifest("example--comparison", createManifest())).rejects.toThrow(
      "rename failed",
    );

    await expect(filesystem.readFile(manifestPath, "utf8")).resolves.toBe('{"previous":true}');
    await expect(filesystem.readdir(directory)).resolves.toEqual(["manifest.json"]);
  });
});
