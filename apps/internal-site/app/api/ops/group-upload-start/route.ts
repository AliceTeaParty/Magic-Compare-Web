import { NextResponse } from "next/server";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { startGroupUpload } from "@/lib/server/repositories/content-repository";
import { GroupUploadStartInputSchema } from "@/lib/server/uploads/contracts";

export const POST = withApiRoute(
  async (request: Request) => {
    const payload = GroupUploadStartInputSchema.parse(await request.json());
    const result = await startGroupUpload(payload);
    return NextResponse.json(result);
  },
  {
    classifyError: () => 400,
  },
);
