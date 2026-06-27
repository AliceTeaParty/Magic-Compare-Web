import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { updateGroupMetadata } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  caseSlug: z.string().min(1),
  groupSlug: z.string().min(1),
  title: z.string().trim().min(1),
  description: z.string(),
});

export const POST = withApiRoute(
  async (request: Request) => {
    const payload = schema.parse(await request.json());
    const result = await updateGroupMetadata(
      payload.caseSlug,
      payload.groupSlug,
      {
        title: payload.title,
        description: payload.description,
      },
    );
    return NextResponse.json(result);
  },
  {
    classifyError: () => 400,
  },
);
