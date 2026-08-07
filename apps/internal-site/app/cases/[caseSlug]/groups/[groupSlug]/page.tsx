import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InternalGroupViewer } from "@/components/internal-group-viewer";
import { getViewerDataset } from "@/lib/server/repositories/content-repository";

export const dynamic = "force-dynamic";

// The Group title comes from Prisma, so metadata and viewer rendering share one cached lookup to
// avoid making title accuracy cost a duplicate full-frame query.
const getCachedViewerDataset = cache(getViewerDataset);

interface InternalGroupPageProps {
  params: Promise<{ caseSlug: string; groupSlug: string }>;
}

export async function generateMetadata({ params }: InternalGroupPageProps): Promise<Metadata> {
  const { caseSlug, groupSlug } = await params;
  const dataset = await getCachedViewerDataset(caseSlug, groupSlug);
  return {
    title: dataset ? `${dataset.group.title} - ${dataset.caseMeta.title}` : "Group 未找到",
  };
}

export default async function InternalGroupPage({ params }: InternalGroupPageProps) {
  const { caseSlug, groupSlug } = await params;
  const dataset = await getCachedViewerDataset(caseSlug, groupSlug);

  if (!dataset) {
    notFound();
  }

  return <InternalGroupViewer dataset={dataset} />;
}
