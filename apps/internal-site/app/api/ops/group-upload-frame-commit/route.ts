import { NextResponse } from "next/server";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { commitGroupUploadFrame } from "@/lib/server/repositories/content-repository";

export const POST = withApiRoute(
  async (request: Request) => {
    const payload = await request.json();
    const result = await commitGroupUploadFrame(payload);
    return NextResponse.json(result);
  },
  {
    classifyError: () => 400,
  },
);
