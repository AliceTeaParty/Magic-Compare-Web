import { notFound } from "next/navigation";
import { CaseWorkspaceBoard } from "@/components/case-workspace-board";
import { InternalPageShell } from "@/components/internal-page-shell";
import { getCaseWorkspace } from "@/lib/server/repositories/content-repository";
import { isCloudflarePagesDeployConfigured } from "@/lib/server/runtime-config";

export const dynamic = "force-dynamic";

export default async function CaseWorkspacePage({
  params,
}: {
  params: Promise<{ caseSlug: string }>;
}) {
  const { caseSlug } = await params;
  const data = await getCaseWorkspace(caseSlug);

  if (!data) {
    notFound();
  }

  return (
    <InternalPageShell>
      <CaseWorkspaceBoard data={data} canDeployPublicSite={isCloudflarePagesDeployConfigured()} />
    </InternalPageShell>
  );
}
