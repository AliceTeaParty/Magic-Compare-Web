import { NextResponse } from "next/server";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import {
  exportPublicSite,
  getPublicSiteOperationErrorStatus,
} from "@/lib/server/public-site/runtime";

export const POST = withApiRoute(
  async () => {
    const result = await exportPublicSite();
    return NextResponse.json(result);
  },
  {
    classifyError: (error) => getPublicSiteOperationErrorStatus(error),
  },
);
