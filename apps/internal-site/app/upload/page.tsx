import { Container } from "@mui/material";
import { WebUploadWorkbench } from "@/components/web-uploader/web-upload-workbench";
import { listCases } from "@/lib/server/repositories/content-repository";

export const dynamic = "force-dynamic";

interface UploadPageProps {
  searchParams: Promise<{
    case?: string | string[];
  }>;
}

export default async function WebUploadPage({ searchParams }: UploadPageProps) {
  const [params, cases] = await Promise.all([
    searchParams,
    listCases().catch(() => []),
  ]);
  const caseParam = Array.isArray(params.case) ? params.case[0] : params.case;

  return (
    <Container
      maxWidth="xl"
      sx={{
        py: { xs: 3.5, md: 5 },
        px: { xs: 2, md: 3 },
      }}
    >
      <WebUploadWorkbench cases={cases} initialCaseSlug={caseParam ?? null} />
    </Container>
  );
}
