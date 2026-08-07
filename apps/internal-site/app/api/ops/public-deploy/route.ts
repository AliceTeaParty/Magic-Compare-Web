import { NextResponse } from "next/server";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import {
  getPublicDeployJob,
  getPublicSiteOperationErrorStatus,
  startPublicDeployJob,
} from "@/lib/server/public-site/runtime";

export const dynamic = "force-dynamic";

export const POST = withApiRoute(
  async () => {
    const result = await startPublicDeployJob();
    return NextResponse.json(result, { status: 202 });
  },
  {
    classifyError: (error) => getPublicSiteOperationErrorStatus(error),
  },
);

export const GET = withApiRoute(async (request: Request) => {
  const jobId = new URL(request.url).searchParams.get("jobId");
  const job = await getPublicDeployJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "没有找到部署任务。" }, { status: 404 });
  }
  return NextResponse.json({ job }, { headers: { "cache-control": "no-store" } });
});
