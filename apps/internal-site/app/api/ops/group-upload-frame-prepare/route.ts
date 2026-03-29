import { NextResponse } from "next/server";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { prepareGroupUploadFrame } from "@/lib/server/repositories/content-repository";

export const POST = withApiRoute(async (request) => {
  const payload = await request.json();
  const result = await prepareGroupUploadFrame(payload);
  return NextResponse.json(result);
});
