import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { startAssetServer } from "./asset-server";
import { parsePublishManifest } from "../../../packages/content-schema/src/index";
import { createViewerFixture, fixtureSvg } from "./viewer-fixture";

const root = process.cwd();
const internal = process.argv[2] === "internal";
const fixture = parsePublishManifest(createViewerFixture());

/** Propagates failures and termination so Playwright owns only its isolated server processes. */
async function run(args: string[]) {
  const child = spawn("pnpm", args, { stdio: "inherit", env: process.env });
  const stop = () => child.kill("SIGTERM");
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  try {
    await new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`pnpm ${args.join(" ")} exited ${code}`)),
      );
    });
  } finally {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
  }
}

/** Prepares disposable fixtures before launching the application. */
async function main() {
  if (process.argv[2] === "assets") {
    startAssetServer();
    return;
  }
  if (internal) {
    // Never seed a developer database, even if this helper is invoked outside Playwright.
    const databaseUrl = process.env.DATABASE_URL ?? "";
    if (!databaseUrl.startsWith(`file:${path.join(root, "output/playwright/e2e/")}`)) {
      throw new Error("E2E requires a database under output/playwright/e2e");
    }
    const sourceDirectory = path.join(root, "output/playwright/e2e/upload-source");
    await rm(sourceDirectory, { recursive: true, force: true });
    await mkdir(sourceDirectory, { recursive: true });
    const publicRequire = createRequire(path.join(root, "apps/public-site/package.json"));
    const sharp = publicRequire("sharp");
    for (const [label, color] of [
      ["src", "#ffffff"],
      ["rip", "#dddddd"],
    ]) {
      await sharp(Buffer.from(fixtureSvg(64, 36, color, 0)))
        .png()
        .toFile(path.join(sourceDirectory, `frame-001_${label}.png`));
    }
    // Dedicated directories expose pairing errors and reordering without changing upload smoke data.
    for (const scenario of ["multiple", "invalid"]) {
      const directory = path.join(root, `output/playwright/e2e/upload-${scenario}-source`);
      await rm(directory, { recursive: true, force: true });
      await mkdir(directory, { recursive: true });
      for (const frame of scenario === "multiple" ? [1, 2] : [1]) {
        for (const label of scenario === "multiple" ? ["src", "rip", "flt"] : ["src"]) {
          await sharp(Buffer.from(fixtureSvg(64, 36, "#dddddd", frame)))
            .png()
            .toFile(path.join(directory, `frame-00${frame}_${label}.png`));
        }
      }
      if (scenario === "invalid")
        await writeFile(path.join(directory, "ignored.txt"), "Not an image");
    }
    await run(["--filter", "@magic-compare/internal-site", "db:push"]);
    const require = createRequire(path.join(root, "apps/internal-site/package.json"));
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    try {
      if (process.env.MAGIC_COMPARE_E2E_FIXTURE !== "empty")
        await prisma.case.create({
          data: {
            slug: fixture.case.slug,
            title: fixture.case.title,
            status: "internal",
            createdAt: new Date("2026-01-01T00:00:00Z"),
            updatedAt: new Date("2026-01-01T00:00:00Z"),
            groups: {
              create: {
                id: fixture.group.id,
                slug: fixture.group.slug,
                title: fixture.group.title,
                description: fixture.group.description,
                order: 0,
                defaultMode: fixture.group.defaultMode,
                storageRoot: "internal-assets/e2e",
                frames: {
                  create: fixture.frames.map(({ assets, ...frame }) => ({
                    ...frame,
                    storagePrefix: "internal-assets/e2e",
                    assets: {
                      create: assets.map(({ placeholder: _placeholder, ...asset }) => ({
                        ...asset,
                        imageUrl: new URL(asset.imageUrl).pathname.slice(1),
                        thumbUrl: new URL(asset.thumbUrl).pathname.slice(1),
                      })),
                    },
                  })),
                },
              },
            },
          },
        });
      if (process.env.MAGIC_COMPARE_E2E_FIXTURE !== "empty") {
        for (const [index, suffix] of ["alpha", "zeta"].entries()) {
          await prisma.case.create({
            data: {
              slug: `e2e-catalog-${suffix}`,
              title: `Catalog ${suffix}`,
              status: "draft",
              tagsJson: JSON.stringify(["catalog-fixture"]),
              createdAt: new Date(`2026-01-0${index + 2}T00:00:00Z`),
              updatedAt: new Date(`2026-01-0${index + 2}T00:00:00Z`),
            },
          });
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  } else {
    const directory = path.join(
      process.env.MAGIC_COMPARE_PUBLISHED_ROOT!,
      "groups",
      fixture.publicSlug,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify(fixture));
  }
  await run([
    "--filter",
    `@magic-compare/${internal ? "internal" : "public"}-site`,
    "exec",
    "next",
    "dev",
    "--port",
    internal ? "3100" : "3101",
  ]);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
