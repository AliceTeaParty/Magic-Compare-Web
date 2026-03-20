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
        <Stack spacing={1.65} sx={{ width: "100%" }}>
          <Typography variant="overline" color="primary.main">
            Magic Compare Web / Internal
          </Typography>
          <Box
            sx={{
              display: "grid",
              gap: { xs: 1.8, lg: 2.4 },
              alignItems: "end",
              gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.1fr) minmax(320px, 0.9fr)" },
              pb: { xs: 2.8, md: 3.1 },
              borderBottom: "1px solid",
              borderColor: "divider",
              animation: "catalogHeaderRise 320ms cubic-bezier(0.22, 1, 0.36, 1)",
              "@keyframes catalogHeaderRise": {
                from: {
                  opacity: 0,
                  transform: "translateY(18px)",
                },
                to: {
                  opacity: 1,
                  transform: "translateY(0)",
                },
              },
            }}
          >
            <Box sx={{ display: "grid", gap: 1.05, minWidth: 0 }}>
              <Typography variant="h2">Internal catalog</Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720 }}>
                Browse draft, internal, and published compare cases. Viewer pages stay focused on
                inspection, while import and publish operations remain explicit.
              </Typography>
            </Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                justifySelf: { xs: "flex-start", lg: "flex-end" },
                maxWidth: 420,
                lineHeight: 1.7,
              }}
            >
              Catalog cards use the same content width as the working area below, so wide screens
              keep a single consistent reading line.
            </Typography>
          </Box>
        </Stack>
        <CaseDirectoryGrid items={cases} />
      </Stack>
    </Container>
  );
}
