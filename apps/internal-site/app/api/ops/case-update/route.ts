import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { updateCaseMetadata } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  caseSlug: z.string().min(1),
  title: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const POST = withApiRoute(async (request: Request) => {
  const payload = schema.parse(await request.json());
  const result = await updateCaseMetadata(payload.caseSlug, {
    title: payload.title,
    summary: payload.summary,
    tags: payload.tags,
  });
  return NextResponse.json(result);
});
