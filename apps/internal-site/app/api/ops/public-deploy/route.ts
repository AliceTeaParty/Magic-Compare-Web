import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import {
  deployPublicSite,
  getPublicSiteOperationErrorStatus,
} from "@/lib/server/public-site/runtime";

const schema = z.object({
  caseId: z.string().min(1).optional(),
});

export const POST = withApiRoute(
  async (request: Request) => {
    const rawBody = await request.text();
    const payload = schema.parse(rawBody ? JSON.parse(rawBody) : {});
    const result = await deployPublicSite(payload.caseId);
    return NextResponse.json(result);
  },
  {
    classifyError: (error) => getPublicSiteOperationErrorStatus(error),
  },
);
