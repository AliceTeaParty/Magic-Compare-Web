import path from "node:path";
import { prisma } from "../lib/server/db/client";
import { applyImportManifest } from "../lib/server/repositories/content-repository";
import { uploadLocalFileToInternalAsset } from "../lib/server/storage/internal-assets";

async function main() {
  const existingCases = await prisma.case.count();

  if (existingCases > 0) {
    return;
  }

  const publishedAssetRoot = path.resolve(
    process.cwd(),
    "../../content/published/groups/demo-grain-study--banding-check/assets",
  );
  const demoAssets = [
    {
      source: "001-before.svg",
      target: "/internal-assets/demo-grain-study/banding-check/001/before.svg",
    },
    {
      source: "001-after.svg",
      target: "/internal-assets/demo-grain-study/banding-check/001/after.svg",
    },
    {
      source: "001-heatmap.svg",
      target: "/internal-assets/demo-grain-study/banding-check/001/heatmap.svg",
    },
    {
      source: "002-before.svg",
      target: "/internal-assets/demo-grain-study/banding-check/002/before.svg",
    },
    {
      source: "002-after.svg",
      target: "/internal-assets/demo-grain-study/banding-check/002/after.svg",
    },
  ];

  for (const asset of demoAssets) {
    await uploadLocalFileToInternalAsset(path.join(publishedAssetRoot, asset.source), asset.target);
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
                imageUrl: "/internal-assets/demo-grain-study/banding-check/001/before.svg",
                thumbUrl: "/internal-assets/demo-grain-study/banding-check/001/before.svg",
                width: 1280,
                height: 720,
                note: "Original gradient",
                isPublic: true,
                isPrimaryDisplay: true,
              },
              {
                kind: "after",
                label: "After",
                imageUrl: "/internal-assets/demo-grain-study/banding-check/001/after.svg",
                thumbUrl: "/internal-assets/demo-grain-study/banding-check/001/after.svg",
                width: 1280,
                height: 720,
                note: "Debanded output",
                isPublic: true,
                isPrimaryDisplay: true,
              },
              {
                kind: "heatmap",
                label: "Heatmap",
                imageUrl: "/internal-assets/demo-grain-study/banding-check/001/heatmap.svg",
                thumbUrl: "/internal-assets/demo-grain-study/banding-check/001/heatmap.svg",
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
                imageUrl: "/internal-assets/demo-grain-study/banding-check/002/before.svg",
                thumbUrl: "/internal-assets/demo-grain-study/banding-check/002/before.svg",
                width: 1280,
                height: 720,
                note: "Original edge detail",
                isPublic: true,
                isPrimaryDisplay: true,
              },
              {
                kind: "after",
                label: "After",
                imageUrl: "/internal-assets/demo-grain-study/banding-check/002/after.svg",
                thumbUrl: "/internal-assets/demo-grain-study/banding-check/002/after.svg",
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

  console.log("Seeded demo case into SQLite and uploaded demo assets to S3.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
