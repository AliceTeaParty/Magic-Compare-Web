import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { reorderFrames } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  groupId: z.string().min(1),
  frameIds: z.array(z.string().min(1)).min(1),
});

export const POST = withApiRoute(
  async (request: Request) => {
    const payload = schema.parse(await request.json());
    await reorderFrames(payload.groupId, payload.frameIds);
    return NextResponse.json({ ok: true });
  },
  {
    classifyError: () => 400,
  },
);
