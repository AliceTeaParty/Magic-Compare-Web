import { Box, Button, Container, Stack, Typography } from "@mui/material";

export default function NotFoundPage() {
  return (
    <Container maxWidth="sm" sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <Box
        sx={{
          width: "100%",
          borderRadius: 5,
          border: "1px solid",
          borderColor: "divider",
          backgroundColor: "rgba(255,255,255,0.03)",
          p: 4,
        }}
      >
        <Stack spacing={1.5}>
          <Typography variant="overline" color="text.secondary">
            Magic Compare
          </Typography>
          <Typography variant="h3">Group not found</Typography>
          <Typography variant="body1" color="text.secondary">
            Public galleries are link-only. This address does not map to a published compare group.
          </Typography>
          <Button href="https://example.com" variant="outlined" disabled>
            Link required
          </Button>
        </Stack>
      </Box>
    </Container>
  );
}
