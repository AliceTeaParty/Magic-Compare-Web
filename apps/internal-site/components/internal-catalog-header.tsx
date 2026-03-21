import { Box, Stack, Typography } from "@mui/material";

export function InternalCatalogHeader() {
  return (
    <Stack spacing={1.65} sx={{ width: "100%" }}>
      <Typography variant="overline" color="primary.main">
        Magic Compare Web / Internal
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: { xs: 1.8, lg: 2.2 },
          alignItems: "end",
          gridTemplateColumns: "1fr",
          pb: { xs: 3.15, md: 3.55 },
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
        <Box sx={{ display: "grid", gap: 1.55, minWidth: 0 }}>
          <Typography variant="h2">Internal catalog</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720, lineHeight: 1.7 }}>
            Browse draft, internal, and published compare cases. Viewer pages stay focused on
            inspection, while import and publish operations remain explicit.
          </Typography>
        </Box>
      </Box>
    </Stack>
  );
}
