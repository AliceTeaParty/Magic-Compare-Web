import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseWorkspaceBoard } from "@/components/case-workspace-board";
import { InternalPageShell } from "@/components/internal-page-shell";
import { getCaseWorkspace } from "@/lib/server/repositories/content-repository";

export const dynamic = "force-dynamic";

// Page metadata and workspace content previously required separate Prisma reads. React cache keeps
// the dynamic browser title accurate without doubling the route's database work.
const getCachedCaseWorkspace = cache(getCaseWorkspace);

interface CaseWorkspacePageProps {
  params: Promise<{ caseSlug: string }>;
}

export async function generateMetadata({ params }: CaseWorkspacePageProps): Promise<Metadata> {
  const { caseSlug } = await params;
  const data = await getCachedCaseWorkspace(caseSlug);
  return { title: data ? `${data.title} - Case` : "Case 未找到" };
}

export default async function CaseWorkspacePage({ params }: CaseWorkspacePageProps) {
  const { caseSlug } = await params;
  const data = await getCachedCaseWorkspace(caseSlug);

  if (!data) {
    notFound();
  }

  return (
    <InternalPageShell>
      <CaseWorkspaceBoard data={data} />
    </InternalPageShell>
  );
}
