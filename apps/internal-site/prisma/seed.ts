import path from "node:path";
import { existsSync } from "node:fs";
import type { ImportManifest } from "@magic-compare/content-schema";
import { DEMO_CASE_SLUG, buildPublicGroupSlug } from "@magic-compare/shared-utils";
import { prisma } from "../lib/server/db/client";
import { publishCase } from "../lib/server/publish/publish-case";
import { applyImportManifest } from "../lib/server/repositories/content-repository";
import { deletePublishedGroup } from "../lib/server/storage/published-content";
import { getPublishedRoot } from "../lib/server/runtime-config";
import { uploadLocalFileToInternalAsset } from "../lib/server/storage/internal-assets";

const DEMO_GROUP_SLUG = "banding-check";
const DEMO_PUBLIC_GROUP_SLUG = buildPublicGroupSlug(DEMO_CASE_SLUG, DEMO_GROUP_SLUG);

const demoAssets = [
  {
    source: "001-before.svg",
    target: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/001/before.svg`,
  },
  {
    source: "001-after.svg",
    target: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/001/after.svg`,
  },
  {
    source: "001-heatmap.svg",
    target: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/001/heatmap.svg`,
  },
  {
    source: "002-before.svg",
    target: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/002/before.svg`,
  },
  {
    source: "002-after.svg",
    target: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/002/after.svg`,
  },
] as const;

const demoManifest: ImportManifest = {
  case: {
    slug: DEMO_CASE_SLUG,
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
        slug: DEMO_GROUP_SLUG,
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
              imageUrl: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/001/before.svg`,
              thumbUrl: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/001/before.svg`,
              width: 1280,
              height: 720,
              note: "Original gradient",
              isPublic: true,
              isPrimaryDisplay: true,
            },
            {
              kind: "after",
              label: "After",
              imageUrl: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/001/after.svg`,
              thumbUrl: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/001/after.svg`,
              width: 1280,
              height: 720,
              note: "Debanded output",
              isPublic: true,
              isPrimaryDisplay: true,
            },
            {
              kind: "heatmap",
              label: "Heatmap",
              imageUrl: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/001/heatmap.svg`,
              thumbUrl: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/001/heatmap.svg`,
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
              imageUrl: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/002/before.svg`,
              thumbUrl: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/002/before.svg`,
              width: 1280,
              height: 720,
              note: "Original edge detail",
              isPublic: true,
              isPrimaryDisplay: true,
            },
            {
              kind: "after",
              label: "After",
              imageUrl: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/002/after.svg`,
              thumbUrl: `/internal-assets/${DEMO_CASE_SLUG}/${DEMO_GROUP_SLUG}/002/after.svg`,
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
};

function demoPublishedAssetRoot(): string {
  return path.resolve(process.cwd(), "prisma/demo-assets");
}

function bundledPublishedRoot(): string {
  return path.resolve(process.cwd(), "../../content/published");
}

function shouldRepublishDemoBundle(): boolean {
  const publishedRoot = path.resolve(getPublishedRoot());
  if (publishedRoot !== bundledPublishedRoot()) {
    return true;
  }

  return !existsSync(path.join(publishedRoot, "groups", DEMO_PUBLIC_GROUP_SLUG, "manifest.json"));
}

async function syncDemoAssets(): Promise<void> {
  for (const asset of demoAssets) {
    await uploadLocalFileToInternalAsset(path.join(demoPublishedAssetRoot(), asset.source), asset.target);
  }
}

async function syncDemoManifest(existingDemoCaseId: string | null): Promise<string | null> {
  if (!existingDemoCaseId) {
    const existingCases = await prisma.case.count();
    if (existingCases > 0) {
      return null;
    }
  }

  const stalePublicSlugs = existingDemoCaseId
    ? (
        await prisma.group.findMany({
          where: {
            caseId: existingDemoCaseId,
            publicSlug: {
              not: null,
            },
          },
          select: {
            publicSlug: true,
          },
        })
      )
        .map((group) => group.publicSlug)
        .filter(
          (publicSlug): publicSlug is string =>
            Boolean(publicSlug) && publicSlug !== DEMO_PUBLIC_GROUP_SLUG,
        )
    : [];

  await syncDemoAssets();

  if (existingDemoCaseId) {
    await prisma.group.deleteMany({
      where: {
        caseId: existingDemoCaseId,
        slug: {
          not: DEMO_GROUP_SLUG,
        },
      },
    });
  }

  await applyImportManifest(demoManifest);

  const demoCase = await prisma.case.findUnique({
    where: { slug: DEMO_CASE_SLUG },
    select: {
      id: true,
      groups: {
        where: {
          slug: DEMO_GROUP_SLUG,
        },
        select: {
          id: true,
          publicSlug: true,
        },
      },
    },
  });

  if (!demoCase || demoCase.groups.length === 0) {
    throw new Error("Demo case was not created during seed.");
  }

  const demoGroup = demoCase.groups[0];
  if (demoGroup.publicSlug !== DEMO_PUBLIC_GROUP_SLUG) {
    await prisma.group.update({
      where: { id: demoGroup.id },
      data: {
        publicSlug: DEMO_PUBLIC_GROUP_SLUG,
      },
    });
  }

  for (const stalePublicSlug of stalePublicSlugs) {
    await deletePublishedGroup(stalePublicSlug);
  }

  return demoCase.id;
}

async function main() {
  const existingDemoCase = await prisma.case.findUnique({
    where: { slug: DEMO_CASE_SLUG },
    select: { id: true },
  });

  const demoCaseId = await syncDemoManifest(existingDemoCase?.id ?? null);
  if (!demoCaseId) {
    return;
  }

  if (shouldRepublishDemoBundle()) {
    await publishCase(demoCaseId);

    if (existingDemoCase) {
      console.log("Repaired existing demo case, refreshed demo assets in S3, and republished the demo bundle.");
      return;
    }

    console.log("Seeded demo case into SQLite, published demo bundle, and uploaded demo assets to S3.");
    return;
  }

  if (existingDemoCase) {
    console.log("Repaired existing demo case and refreshed demo assets in S3.");
    return;
  }

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
