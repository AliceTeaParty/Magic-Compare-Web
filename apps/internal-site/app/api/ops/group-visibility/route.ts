import { NextResponse } from "next/server";
import { z } from "zod";
import { setGroupVisibility } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  caseSlug: z.string().min(1),
  groupSlug: z.string().min(1),
  isPublic: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    const result = await setGroupVisibility(payload.caseSlug, payload.groupSlug, payload.isPublic);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update group visibility." },
      { status: 400 },
    );
  }
}
