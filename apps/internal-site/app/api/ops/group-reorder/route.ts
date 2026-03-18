import { NextResponse } from "next/server";
import { z } from "zod";
import { reorderGroups } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  caseId: z.string().min(1),
  groupIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    await reorderGroups(payload.caseId, payload.groupIds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reorder failed." },
      { status: 400 },
    );
  }
}
