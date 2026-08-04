import { CloudUploadOutlined } from "@mui/icons-material";
import { Button, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { CaseCreateButton } from "./case-create-button";
import { FluentFolderEmoji } from "./fluent-emoji";

export function CaseDirectoryEmptyState() {
  return (
    <Stack
      sx={{
        alignItems: "center",
        py: { xs: 7, md: 10 },
        px: 2,
        textAlign: "center",
        borderRadius: 2,
        backgroundColor: "var(--mui-palette-surface-containerLow)",
      }}
      spacing={1.5}
    >
      <FluentFolderEmoji size={72} />
      <Typography variant="h3">还没有 Case</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
        先建立一个内部工作区，再上传需要检查的对比素材。
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1, pt: 1 }}>
        <CaseCreateButton />
        <Button
          component={Link}
          href="/upload"
          variant="outlined"
          startIcon={<CloudUploadOutlined />}
        >
          前往上传
        </Button>
      </Stack>
    </Stack>
  );
}
