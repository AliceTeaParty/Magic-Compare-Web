import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { reorderGroups } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  caseId: z.string().min(1),
  groupIds: z.array(z.string().min(1)).min(1),
});

export const POST = withApiRoute(
  async (request: Request) => {
    const payload = schema.parse(await request.json());
    await reorderGroups(payload.caseId, payload.groupIds);
    return NextResponse.json({ ok: true });
  },
  {
    classifyError: () => 400,
  },
);
