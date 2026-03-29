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
    <Container
      maxWidth="xl"
      sx={{
        // Catalog and workspace now share the same page-edge rhythm so jumping between list and
        // workspace feels like one internal tool instead of two unrelated shells.
        py: { xs: 3.5, md: 5.25 },
        px: { xs: 2, md: 3 },
      }}
    >
      <Stack spacing={{ xs: 3.25, md: 4.75 }}>
        <InternalCatalogHeader />
        <CaseDirectoryGrid items={cases} />
      </Stack>
    </Container>
  );
}
