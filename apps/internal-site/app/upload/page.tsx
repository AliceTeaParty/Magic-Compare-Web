import type { Metadata } from "next";
import { InternalPageShell } from "@/components/internal-page-shell";
import { WebUploadWorkbench } from "@/components/web-uploader/web-upload-workbench";
import { listCases } from "@/lib/server/repositories/content-repository";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "上传工作台" };

interface UploadPageProps {
  searchParams: Promise<{
    case?: string | string[];
  }>;
}

export default async function WebUploadPage({ searchParams }: UploadPageProps) {
  const [params, cases] = await Promise.all([searchParams, listCases().catch(() => [])]);
  const caseParam = Array.isArray(params.case) ? params.case[0] : params.case;

  return (
    <InternalPageShell>
      <WebUploadWorkbench cases={cases} initialCaseSlug={caseParam ?? null} />
    </InternalPageShell>
  );
}
