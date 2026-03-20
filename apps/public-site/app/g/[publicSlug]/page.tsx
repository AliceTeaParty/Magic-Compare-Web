import { notFound } from "next/navigation";
import { createViewerDatasetFromPublishManifest } from "@magic-compare/compare-core/viewer-data";
import { GroupViewerWorkbench } from "@magic-compare/ui";
import { getPublishedManifest, listPublishedGroupSlugs } from "@/lib/content";

const EMPTY_PUBLIC_GROUP_PLACEHOLDER = "__empty__";
export const dynamicParams = false;

export async function generateStaticParams() {
  const slugs = await listPublishedGroupSlugs();
  const exportableSlugs = slugs.length > 0 ? slugs : [EMPTY_PUBLIC_GROUP_PLACEHOLDER];
  return exportableSlugs.map((publicSlug) => ({ publicSlug }));
}

export default async function PublicGroupPage({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}) {
  const { publicSlug } = await params;
  if (publicSlug === EMPTY_PUBLIC_GROUP_PLACEHOLDER) {
    notFound();
  }
  const manifest = await getPublishedManifest(publicSlug);

  if (!manifest) {
    notFound();
  }

  const dataset = createViewerDatasetFromPublishManifest(manifest);

  return <GroupViewerWorkbench dataset={dataset} variant="public" />;
}
