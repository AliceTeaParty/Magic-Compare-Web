import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { setGroupVisibility } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  caseSlug: z.string().min(1),
  groupSlug: z.string().min(1),
  isPublic: z.boolean(),
});

export const POST = withApiRoute(
  async (request: Request) => {
    const payload = schema.parse(await request.json());
    const result = await setGroupVisibility(payload.caseSlug, payload.groupSlug, payload.isPublic);
    return NextResponse.json(result);
  },
  {
    classifyError: () => 400,
  },
);
