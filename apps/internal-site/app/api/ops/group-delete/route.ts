import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { deleteGroup } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  caseSlug: z.string().min(1),
  groupSlug: z.string().min(1),
});

export const POST = withApiRoute(async (request) => {
  const payload = schema.parse(await request.json());
  const result = await deleteGroup(payload.caseSlug, payload.groupSlug);
  return NextResponse.json(result);
});
