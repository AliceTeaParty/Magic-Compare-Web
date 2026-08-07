import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createViewerDatasetFromPublishManifest } from "@magic-compare/compare-core/viewer-data";
import { GroupViewerWorkbench } from "@magic-compare/ui";
import { getPublishedManifest, listPublishedGroupSlugs } from "@/lib/content";
import { buildPublicGroupMetadata } from "@/lib/page-metadata";
import { getPublicSiteBaseUrl } from "@/lib/runtime-config";

const EMPTY_PUBLIC_GROUP_PLACEHOLDER = "__empty__";
export const dynamicParams = false;

// Metadata and the viewer need the same manifest during one static render. React cache prevents
// the SEO pass from reading and validating a large manifest a second time.
const getCachedPublishedManifest = cache(getPublishedManifest);

interface PublicGroupPageProps {
  params: Promise<{ publicSlug: string }>;
}

export async function generateStaticParams() {
  const slugs = await listPublishedGroupSlugs();
  const exportableSlugs = slugs.length > 0 ? slugs : [EMPTY_PUBLIC_GROUP_PLACEHOLDER];
  return exportableSlugs.map((publicSlug) => ({ publicSlug }));
}

/** Generates share metadata only for real exported groups; missing slugs keep the 404 defaults. */
export async function generateMetadata({ params }: PublicGroupPageProps): Promise<Metadata> {
  const { publicSlug } = await params;
  if (publicSlug === EMPTY_PUBLIC_GROUP_PLACEHOLDER) return {};

  const manifest = await getCachedPublishedManifest(publicSlug);
  return manifest ? buildPublicGroupMetadata(manifest, getPublicSiteBaseUrl()) : {};
}

export default async function PublicGroupPage({ params }: PublicGroupPageProps) {
  const { publicSlug } = await params;
  if (publicSlug === EMPTY_PUBLIC_GROUP_PLACEHOLDER) {
    notFound();
  }
  const manifest = await getCachedPublishedManifest(publicSlug);

  if (!manifest) {
    notFound();
  }

  const dataset = createViewerDatasetFromPublishManifest(manifest);

  return <GroupViewerWorkbench dataset={dataset} variant="public" />;
}
