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
    <Container
      maxWidth="xl"
      sx={{
        // Match the catalog container inset so workspace pages inherit the same visual frame and
        // layout tweaks do not drift into page-by-page padding guesses again.
        py: { xs: 3.75, md: 5 },
        px: { xs: 2, md: 3 },
      }}
    >
      <CaseWorkspaceBoard data={data} canDeployPublicSite={isCloudflarePagesDeployConfigured()} />
    </Container>
  );
}
