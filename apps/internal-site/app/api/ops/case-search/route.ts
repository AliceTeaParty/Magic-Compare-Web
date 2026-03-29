import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { searchCases } from "@/lib/server/repositories/content-repository";

const CaseSearchRequestSchema = z.object({
  query: z.string().default(""),
  limit: z.number().int().positive().max(20).default(8),
});

export const POST = withApiRoute(async (request) => {
  const payload = CaseSearchRequestSchema.parse(await request.json());
  const cases = await searchCases(payload.query, payload.limit);
  return NextResponse.json({ cases });
});
