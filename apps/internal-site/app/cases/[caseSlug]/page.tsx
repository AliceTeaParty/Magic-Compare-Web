import { Container } from "@mui/material";
import { notFound } from "next/navigation";
import { CaseWorkspaceBoard } from "@/components/case-workspace-board";
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
    <Container maxWidth="xl" sx={{ py: { xs: 4, md: 5 } }}>
      <CaseWorkspaceBoard data={data} canDeployPublicSite={isCloudflarePagesDeployConfigured()} />
    </Container>
  );
}
