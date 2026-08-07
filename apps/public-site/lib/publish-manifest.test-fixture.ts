import type { PublishManifest } from "@magic-compare/content-schema";

interface PublishManifestFixtureOptions {
  caseSlug?: string;
  groupSlug?: string;
  publicSlug?: string;
}

/** Keeps valid manifest setup consistent while individual tests vary only routing identity. */
export function buildPublishManifestFixture(
  options: PublishManifestFixtureOptions = {},
): PublishManifest {
  const caseSlug = options.caseSlug ?? "2026";
  const groupSlug = options.groupSlug ?? "comparison";
  const publicSlug = options.publicSlug ?? `${caseSlug}--${groupSlug}`;
  const assetRoot = `https://assets.example.com/internal-assets/${caseSlug}/${groupSlug}/001`;

  return {
    schemaVersion: 1,
    publicSlug,
    generatedAt: "2026-03-20T00:00:00.000Z",
    assetBasePath: `https://assets.example.com/internal-assets/${caseSlug}/${groupSlug}`,
    case: {
      slug: caseSlug,
      title: caseSlug,
      subtitle: "",
      summary: "",
      tags: [],
      publishedAt: "2026-03-20T00:00:00.000Z",
    },
    group: {
      id: `group-${groupSlug}`,
      slug: groupSlug,
      publicSlug,
      title: groupSlug,
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
            imageUrl: `${assetRoot}/before.png`,
            thumbUrl: `${assetRoot}/before.webp`,
            width: 1280,
            height: 720,
            note: "",
            isPrimaryDisplay: true,
          },
          {
            id: "asset-after",
            kind: "after",
            label: "After",
            imageUrl: `${assetRoot}/after.png`,
            thumbUrl: `${assetRoot}/after.webp`,
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
