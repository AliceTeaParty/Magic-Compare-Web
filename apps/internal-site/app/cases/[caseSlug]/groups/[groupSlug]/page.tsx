import { notFound } from "next/navigation";
import { InternalGroupViewer } from "@/components/internal-group-viewer";
import { getViewerDataset } from "@/lib/server/repositories/content-repository";

export const dynamic = "force-dynamic";

export default async function InternalGroupPage({
  params,
}: {
  params: Promise<{ caseSlug: string; groupSlug: string }>;
}) {
  const { caseSlug, groupSlug } = await params;
  const dataset = await getViewerDataset(caseSlug, groupSlug);

  if (!dataset) {
    notFound();
  }

  return <InternalGroupViewer dataset={dataset} />;
}
