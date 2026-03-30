import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { getCaseWorkspace } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  caseSlug: z.string().min(1),
});

export const POST = withApiRoute(async (request: Request) => {
  const payload = schema.parse(await request.json());
  const workspace = await getCaseWorkspace(payload.caseSlug);

  if (!workspace) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  return NextResponse.json({
    case: {
      id: workspace.id,
      slug: workspace.slug,
      title: workspace.title,
      summary: workspace.summary,
      status: workspace.status,
      publishedAt: workspace.publishedAt,
      tags: workspace.tags,
    },
    groups: workspace.groups,
  });
});
