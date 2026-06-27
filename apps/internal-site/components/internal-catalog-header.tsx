import { Box, Stack, Typography } from "@mui/material";

/**
 * Keeps the catalog opening compact so repeat operators reach the case list without rereading
 * workflow prose that is already expressed by the case cards and page actions.
 */
export function InternalCatalogHeader() {
  return (
    <Stack spacing={1.55} sx={{ width: "100%" }}>
      <Typography variant="overline" color="primary.main">
        Magic Compare Web / Internal
      </Typography>
      <Box
        sx={{
          display: "grid",
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
      </Box>
    </Stack>
  );
}
