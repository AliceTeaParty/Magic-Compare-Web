import { Box, Container, Stack, Typography } from "@mui/material";
import { CaseDirectoryGrid } from "@/components/case-directory-grid";
import { listCases } from "@/lib/server/repositories/content-repository";

export const dynamic = "force-dynamic";

export default async function InternalHomePage() {
  const cases: Awaited<ReturnType<typeof listCases>> = await listCases().catch(
    () => [],
  );

  return (
    <Container maxWidth="xl" sx={{ py: 5 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Magic Compare Web
          </Typography>
          <Typography variant="h3">Internal catalog</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 760 }}>
            Browse draft, internal, and published compare cases. Viewer pages stay focused on
            analysis, while import and publish operations remain explicit.
          </Typography>
        </Box>
        <CaseDirectoryGrid items={cases} />
      </Stack>
    </Container>
  );
}
