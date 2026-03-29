import { NextResponse } from "next/server";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { startGroupUpload } from "@/lib/server/repositories/content-repository";

export const POST = withApiRoute(async (request) => {
  const payload = await request.json();
  const result = await startGroupUpload(payload);
  return NextResponse.json(result);
});
