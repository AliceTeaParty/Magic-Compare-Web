import { NextResponse } from "next/server";
import { SlugSchema } from "@magic-compare/content-schema";
import { z } from "zod";
import { withApiRoute } from "@/lib/server/api/with-api-route";
import { createCase } from "@/lib/server/repositories/content-repository";

const schema = z.object({
  slug: SlugSchema,
  title: z.string().trim().min(1),
  summary: z.string().default(""),
});

export const POST = withApiRoute(
  async (request: Request) => {
    const payload = schema.parse(await request.json());
    const result = await createCase(payload);
    return NextResponse.json(result);
  },
  {
    classifyError: () => 400,
  },
);
