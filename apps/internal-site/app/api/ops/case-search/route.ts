import { NextResponse } from "next/server";
import { z } from "zod";
import { searchCases } from "@/lib/server/repositories/content-repository";

const CaseSearchRequestSchema = z.object({
  query: z.string().default(""),
  limit: z.number().int().positive().max(20).default(8),
});

export async function POST(request: Request) {
  try {
    const payload = CaseSearchRequestSchema.parse(await request.json());
    const cases = await searchCases(payload.query, payload.limit);
    return NextResponse.json({ cases });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Case search failed." },
      { status: 500 },
    );
  }
}
