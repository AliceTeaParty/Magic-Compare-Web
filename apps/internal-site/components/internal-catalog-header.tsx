import { Box, Stack, Typography } from "@mui/material";

/**
 * Keeps the catalog opening minimal and editorial. The earlier right-hand workflow explainer added
 * noise without helping repeat users, so the header now stays as a single narrative block.
 */
export function InternalCatalogHeader() {
  return (
    <Stack spacing={1.8} sx={{ width: "100%" }}>
      <Typography variant="overline" color="primary.main">
        Magic Compare Web / Internal
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 1.4,
          pb: { xs: 2.75, md: 3.4 },
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
        <Typography variant="h2" component="h1">
          Internal catalog
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 700, lineHeight: 1.72 }}
        >
          Browse draft, internal, and published compare cases. Viewer pages
          stay focused on inspection, while import and publish operations remain
          explicit.
        </Typography>
      </Box>
    </Stack>
  );
}
