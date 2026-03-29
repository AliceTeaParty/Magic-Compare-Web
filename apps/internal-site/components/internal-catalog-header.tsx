import { Box, Stack, Typography } from "@mui/material";

/**
 * Rebuilds the catalog hero as a two-part header so the page opens with both identity and
 * workflow orientation instead of a single block of copy floating above a card wall.
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
          gap: { xs: 2, md: 2.6, xl: 3.4 },
          alignItems: "end",
          // Breaking into two columns on wide screens gives the page a stronger opening hierarchy
          // than the old single-column stack, which made the catalog feel like generic app chrome.
          gridTemplateColumns: {
            xs: "1fr",
            xl: "minmax(0, 1.45fr) minmax(290px, 0.82fr)",
          },
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
        <Box sx={{ display: "grid", gap: 1.4, minWidth: 0 }}>
          <Typography variant="h2">Internal catalog</Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 700, lineHeight: 1.72 }}
          >
            Browse draft, internal, and published compare cases. Viewer pages
            stay focused on inspection, while import and publish operations
            remain explicit.
          </Typography>
        </Box>
        <Box
          sx={{
            display: "grid",
            gap: 0.7,
            maxWidth: { xs: "100%", xl: 360 },
            justifySelf: { xl: "end" },
            pt: { xl: 0.4 },
          }}
        >
          {/* Keep a lightweight workflow cue in the header so the catalog reads like an entry point
              into a review pipeline, not just an undifferentiated list of case cards. */}
          <Typography variant="overline" color="text.secondary">
            Workflow cadence
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ lineHeight: 1.72 }}
          >
            Scan case health here, move into the workspace to manage visibility,
            then open the viewer only when you need frame-level inspection.
          </Typography>
        </Box>
      </Box>
    </Stack>
  );
}
