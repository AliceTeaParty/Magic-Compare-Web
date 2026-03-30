import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { publishCase } from "@/lib/server/publish/publish-case";

const schema = z.object({
  caseId: z.string().min(1),
});

export const POST = withApiRoute(
  async (request: Request) => {
    const payload = schema.parse(await request.json());
    const result = await publishCase(payload.caseId);
    return NextResponse.json(result);
  },
  {
    classifyError: () => 400,
  },
);
