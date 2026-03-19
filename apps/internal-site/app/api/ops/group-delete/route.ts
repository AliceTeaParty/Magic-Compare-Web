import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteGroup } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  caseSlug: z.string().min(1),
  groupSlug: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    const result = await deleteGroup(payload.caseSlug, payload.groupSlug);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed." },
      { status: 400 },
    );
  }
}
