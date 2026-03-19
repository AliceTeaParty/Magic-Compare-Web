import { Box, Container, Stack, Typography } from "@mui/material";
import { CaseDirectoryGrid } from "@/components/case-directory-grid";
import { listCases } from "@/lib/server/repositories/content-repository";

export const dynamic = "force-dynamic";

export default async function InternalHomePage() {
  const cases: Awaited<ReturnType<typeof listCases>> = await listCases().catch(
    () => [],
  );

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 4, md: 5.5 } }}>
      <Stack spacing={{ xs: 3.5, md: 4.5 }}>
        <Stack spacing={1.5} sx={{ maxWidth: 860 }}>
          <Typography variant="overline" color="primary.main">
            Magic Compare Web / Internal
          </Typography>
          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              alignItems: "end",
              gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.2fr) minmax(280px, 0.8fr)" },
              pb: 2.5,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="h2">Internal catalog</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 520 }}>
              Browse draft, internal, and published compare cases. Viewer pages stay focused on
              inspection, while import and publish operations remain explicit.
            </Typography>
          </Box>
        </Stack>
        <CaseDirectoryGrid items={cases} />
      </Stack>
    </Container>
  );
}
