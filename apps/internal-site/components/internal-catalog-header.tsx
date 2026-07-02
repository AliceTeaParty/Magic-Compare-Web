import { CloudUpload } from "@mui/icons-material";
import { Box, Button, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { CaseCreateButton } from "./case-create-button";

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
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
          gap: { xs: 1.5, md: 2 },
          alignItems: "end",
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
        <Stack
          direction="row"
          spacing={1}
          flexWrap="wrap"
          useFlexGap
          sx={{ justifySelf: { xs: "start", md: "end" } }}
        >
          <CaseCreateButton />
          <Button
            component={Link}
            href="/upload"
            variant="contained"
            startIcon={<CloudUpload />}
            sx={{ minHeight: 42 }}
          >
            上传对比
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
