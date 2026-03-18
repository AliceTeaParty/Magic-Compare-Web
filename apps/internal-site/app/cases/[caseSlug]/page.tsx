import { Container } from "@mui/material";
import { notFound } from "next/navigation";
import { CaseWorkspaceBoard } from "@/components/case-workspace-board";
import { getCaseWorkspace } from "@/lib/server/repositories/content-repository";

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
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <CaseWorkspaceBoard data={data} />
    </Container>
  );
}
