import { notFound } from "next/navigation";
import { createViewerDatasetFromPublishManifest } from "@magic-compare/compare-core/viewer-data";
import { GroupViewerWorkbench } from "@magic-compare/ui";
import { getPublishedManifest, listPublishedGroupSlugs } from "@/lib/content";

export const dynamicParams = false;

export async function generateStaticParams() {
  const slugs = await listPublishedGroupSlugs();
  return slugs.map((publicSlug) => ({ publicSlug }));
}

export default async function PublicGroupPage({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}) {
  const { publicSlug } = await params;
  const manifest = await getPublishedManifest(publicSlug);

  if (!manifest) {
    notFound();
  }

  const dataset = createViewerDatasetFromPublishManifest(manifest);

  return <GroupViewerWorkbench dataset={dataset} variant="public" />;
}
