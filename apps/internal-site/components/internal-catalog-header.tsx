import { CloudUploadOutlined } from "@mui/icons-material";
import { Button } from "@mui/material";
import Link from "next/link";
import { InternalPageHeader } from "./internal-page-shell";

export function InternalCatalogHeader() {
  return (
    <InternalPageHeader
      title="Case"
      subtitle="画面を変えること、それが魔法"
      actions={
        <Button
          component={Link}
          href="/upload"
          variant="outlined"
          startIcon={<CloudUploadOutlined />}
        >
          上传对比
        </Button>
      }
    />
  );
}
