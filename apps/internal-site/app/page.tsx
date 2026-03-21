import { Container, Stack } from "@mui/material";
import { CaseDirectoryGrid } from "@/components/case-directory-grid";
import { InternalCatalogHeader } from "@/components/internal-catalog-header";
import { listCases } from "@/lib/server/repositories/content-repository";

export const dynamic = "force-dynamic";

export default async function InternalHomePage() {
  const cases: Awaited<ReturnType<typeof listCases>> = await listCases().catch(
    () => [],
  );

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 4, md: 5.5 } }}>
      <Stack spacing={{ xs: 3.5, md: 4.5 }}>
        <InternalCatalogHeader />
        <CaseDirectoryGrid items={cases} />
      </Stack>
    </Container>
  );
}
