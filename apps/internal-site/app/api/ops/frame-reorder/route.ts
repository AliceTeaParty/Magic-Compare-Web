import { NextResponse } from "next/server";
import { z } from "zod";
import { reorderFrames } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  groupId: z.string().min(1),
  frameIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    await reorderFrames(payload.groupId, payload.frameIds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reorder failed." },
      { status: 400 },
    );
  }
}
