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
    <Stack sx={{ width: "100%" }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
          gap: { xs: 1.5, md: 2 },
          alignItems: "end",
          pb: { xs: 2.75, md: 3.4 },
          borderBottom: "1px solid",
          borderColor: "divider",
          // Keep navigation targets at their final position instead of animating the whole header.
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
