import { CloudUploadOutlined } from "@mui/icons-material";
import { Button } from "@mui/material";
import Link from "next/link";
import { CaseCreateButton } from "./case-create-button";
import { InternalPageHeader } from "./internal-page-shell";

export function InternalCatalogHeader() {
  return (
    <InternalPageHeader
      title="Case"
      subtitle="管理对比项目、公开状态和上传内容。"
      actions={
        <>
          <CaseCreateButton />
          <Button
            component={Link}
            href="/upload"
            variant="outlined"
            startIcon={<CloudUploadOutlined />}
          >
            上传对比
          </Button>
        </>
      }
    />
  );
}
