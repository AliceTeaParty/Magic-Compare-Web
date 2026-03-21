import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deployPublicSite,
  getPublicSiteOperationErrorStatus,
} from "@/lib/server/public-site/runtime";

const schema = z.object({
  caseId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = schema.parse(rawBody ? JSON.parse(rawBody) : {});
    const result = await deployPublicSite(payload.caseId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Public deploy failed." },
      { status: getPublicSiteOperationErrorStatus(error) },
    );
  }
}
