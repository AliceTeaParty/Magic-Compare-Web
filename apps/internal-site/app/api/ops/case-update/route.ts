import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { updateCaseSummary } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  caseSlug: z.string().min(1),
  summary: z.string(),
});

export const POST = withApiRoute(
  async (request: Request) => {
    const payload = schema.parse(await request.json());
    const result = await updateCaseSummary(payload.caseSlug, payload.summary);
    return NextResponse.json(result);
  },
  {
    classifyError: () => 400,
  },
);
