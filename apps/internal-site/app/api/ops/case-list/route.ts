import { NextResponse } from "next/server";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { listCases } from "@/lib/server/repositories/content-repository";

export const POST = withApiRoute(async () => {
  const cases = await listCases();
  return NextResponse.json({ cases });
});
