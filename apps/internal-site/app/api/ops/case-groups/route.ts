import { NextResponse } from "next/server";
import { z } from "zod";
import { getCaseWorkspace } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  caseSlug: z.string().min(1),
});

export async function POST(request: Request) {
  try {
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Case group list failed." },
      { status: 400 },
    );
  }
}
