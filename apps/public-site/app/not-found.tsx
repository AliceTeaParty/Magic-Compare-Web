import { LinkOffOutlined } from "@mui/icons-material";
import { Box, Container, Stack, Typography } from "@mui/material";

export default function NotFoundPage() {
  return (
    <Container maxWidth="sm" sx={{ minHeight: "100svh", display: "grid", placeItems: "center" }}>
      {/* The missing-link state uses the workbench surface directly so an unavailable gallery does
          not fall back to the retired public card treatment. */}
      <Box sx={{ width: "100%", px: { xs: 1, sm: 2 }, py: 6 }}>
        <Stack spacing={1.5} sx={{ maxWidth: 520 }}>
          <LinkOffOutlined aria-hidden="true" sx={{ color: "primary.main", fontSize: 40 }} />
          <Typography variant="h2">Group not found</Typography>
          <Typography variant="body1" sx={{ maxWidth: "62ch", color: "text.secondary" }}>
            This address does not map to a published compare group. Check the shared link or ask the
            publisher to publish the group again.
          </Typography>
        </Stack>
      </Box>
    </Container>
  );
}
