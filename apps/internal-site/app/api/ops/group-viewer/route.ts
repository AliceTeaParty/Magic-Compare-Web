import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { getViewerDataset } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  caseSlug: z.string().min(1),
  groupSlug: z.string().min(1),
});

/** Returns one Viewer payload without replacing the active App Router page subtree. */
export const POST = withApiRoute(async (request: Request) => {
  const payload = schema.parse(await request.json());
  const dataset = await getViewerDataset(payload.caseSlug, payload.groupSlug);

  if (!dataset) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }

  return NextResponse.json({ dataset });
});
