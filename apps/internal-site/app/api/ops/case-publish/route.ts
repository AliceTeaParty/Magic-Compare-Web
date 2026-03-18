import { NextResponse } from "next/server";
import { z } from "zod";
import { publishCase } from "@/lib/server/publish/publish-case";

const schema = z.object({
  caseId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    const result = await publishCase(payload.caseId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Publish failed." },
      { status: 400 },
    );
  }
}
