import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/server/db/client";
import { applyImportManifest } from "../lib/server/repositories/content-repository";

async function main() {
  const existingCases = await prisma.case.count();

  if (existingCases > 0) {
    return;
  }

  const internalAssetRoot = path.join(process.cwd(), "public", "internal-assets", "demo-grain-study");
  const publishedAssetRoot = path.resolve(
    process.cwd(),
    "../../content/published/groups/demo-grain-study--banding-check/assets",
  );

  await mkdir(internalAssetRoot, { recursive: true });

  const files = [
    "001-before.svg",
    "001-after.svg",
    "001-heatmap.svg",
    "002-before.svg",
    "002-after.svg",
  ];

  for (const file of files) {
    await copyFile(path.join(publishedAssetRoot, file), path.join(internalAssetRoot, file));
  }

  await applyImportManifest({
    case: {
      slug: "demo-grain-study",
      title: "Demo Grain Study",
      subtitle: "Banding and texture recovery",
      summary: "Seeded case that mirrors the published demo bundle.",
      tags: ["grain", "banding", "deband"],
      status: "internal",
      coverAssetLabel: "After",
    },
    groups: [
      {
        group: {
          slug: "banding-check",
          title: "Banding Check",
          description: "Two frames comparing gradient cleanup and edge retention.",
          order: 0,
          defaultMode: "before-after",
          isPublic: true,
          tags: ["gradient", "grain"],
        },
        frames: [
          {
            frame: {
              title: "Gradient Sweep",
              caption: "Seed frame with heatmap overlay.",
              order: 0,
              isPublic: true,
            },
            assets: [
              {
                kind: "before",
                label: "Before",
                imageUrl: "/internal-assets/demo-grain-study/001-before.svg",
                thumbUrl: "/internal-assets/demo-grain-study/001-before.svg",
                width: 1280,
                height: 720,
                note: "Original gradient",
                isPublic: true,
                isPrimaryDisplay: true,
              },
              {
                kind: "after",
                label: "After",
                imageUrl: "/internal-assets/demo-grain-study/001-after.svg",
                thumbUrl: "/internal-assets/demo-grain-study/001-after.svg",
                width: 1280,
                height: 720,
                note: "Debanded output",
                isPublic: true,
                isPrimaryDisplay: true,
              },
              {
                kind: "heatmap",
                label: "Heatmap",
                imageUrl: "/internal-assets/demo-grain-study/001-heatmap.svg",
                thumbUrl: "/internal-assets/demo-grain-study/001-heatmap.svg",
                width: 1280,
                height: 720,
                note: "Difference emphasis",
                isPublic: true,
                isPrimaryDisplay: false,
              },
            ],
          },
          {
            frame: {
              title: "Edge Hold",
              caption: "Second frame intentionally omits heatmap for fallback coverage.",
              order: 1,
              isPublic: true,
            },
            assets: [
              {
                kind: "before",
                label: "Before",
                imageUrl: "/internal-assets/demo-grain-study/002-before.svg",
                thumbUrl: "/internal-assets/demo-grain-study/002-before.svg",
                width: 1280,
                height: 720,
                note: "Original edge detail",
                isPublic: true,
                isPrimaryDisplay: true,
              },
              {
                kind: "after",
                label: "After",
                imageUrl: "/internal-assets/demo-grain-study/002-after.svg",
                thumbUrl: "/internal-assets/demo-grain-study/002-after.svg",
                width: 1280,
                height: 720,
                note: "Refined edge detail",
                isPublic: true,
                isPrimaryDisplay: true,
              },
            ],
          },
        ],
      },
    ],
  });

  console.log("Seeded demo case into SQLite and staged internal assets.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
